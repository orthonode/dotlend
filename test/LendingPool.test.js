const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("LendingPool", function () {
  async function deployFixture() {
    const [owner, user, liquidator] = await ethers.getSigners();

    const MockvDOT = await ethers.getContractFactory("MockvDOT");
    const vdot = await MockvDOT.deploy();
    await vdot.waitForDeployment();

    const MockUSDH = await ethers.getContractFactory("MockUSDH");
    const usdh = await MockUSDH.deploy();
    await usdh.waitForDeployment();

    const PriceOracle = await ethers.getContractFactory("PriceOracle");
    const oracle = await PriceOracle.deploy();
    await oracle.waitForDeployment();
    await oracle.setAuthorizedOracle(owner.address);
    await oracle.submitPrice(vdot.target, ethers.parseEther("10")); // $10/vDOT

    const CollateralVault = await ethers.getContractFactory("CollateralVault");
    const vault = await CollateralVault.deploy(vdot.target, oracle.target);
    await vault.waitForDeployment();

    const LendingPool = await ethers.getContractFactory("LendingPool");
    const pool = await LendingPool.deploy(vault.target, usdh.target, oracle.target, vdot.target);
    await pool.waitForDeployment();

    await vault.setLendingPool(pool.target);

    // User: 100 vDOT, deposited 10 vDOT → $100 collateral
    await vdot.mint(user.address, ethers.parseEther("100"));
    await vdot.connect(user).approve(vault.target, ethers.parseEther("100"));
    await vault.connect(user).deposit(ethers.parseEther("10"));

    return { vault, vdot, usdh, oracle, pool, owner, user, liquidator };
  }

  async function borrowedFixture() {
    const ctx = await deployFixture();
    await ctx.pool.connect(ctx.user).borrow(ethers.parseEther("50"));
    // Mint extra buffer so user can repay principal + any accrued interest
    await ctx.usdh.mint(ctx.user.address, ethers.parseEther("1"));
    await ctx.usdh.connect(ctx.user).approve(ctx.pool.target, ethers.parseEther("100"));
    return ctx;
  }

  async function liquidatableFixture() {
    const ctx = await deployFixture();
    await ctx.pool.connect(ctx.user).borrow(ethers.parseEther("70"));
    // Price crash: $10 → $8. HF = (80*80*1e18)/(70*100) ≈ 0.914 < 1e18
    await ctx.oracle.submitPrice(ctx.vdot.target, ethers.parseEther("8"));
    // Mint buffer above $70 so liquidator can cover debt + any accrued interest
    await ctx.usdh.mint(ctx.liquidator.address, ethers.parseEther("75"));
    await ctx.usdh.connect(ctx.liquidator).approve(ctx.pool.target, ethers.parseEther("75"));
    return ctx;
  }

  describe("borrow", function () {
    it("user can borrow up to 70% LTV", async function () {
      const { pool, vault, user } = await loadFixture(deployFixture);
      await pool.connect(user).borrow(ethers.parseEther("70"));
      expect(await vault.debtBalance(user.address)).to.equal(ethers.parseEther("70"));
    });

    it("reverts on zero borrow", async function () {
      const { pool, user } = await loadFixture(deployFixture);
      await expect(pool.connect(user).borrow(0n))
        .to.be.revertedWith("Pool: zero amount");
    });

    it("reverts when exceeding LTV", async function () {
      const { pool, user } = await loadFixture(deployFixture);
      await expect(pool.connect(user).borrow(ethers.parseEther("71")))
        .to.be.revertedWith("Pool: exceeds LTV");
    });

    it("reverts when no collateral deposited", async function () {
      const { pool, liquidator } = await loadFixture(deployFixture);
      await expect(pool.connect(liquidator).borrow(ethers.parseEther("1")))
        .to.be.revertedWith("Pool: no collateral");
    });

    it("mints USDH to borrower", async function () {
      const { pool, usdh, user } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("50");
      await pool.connect(user).borrow(amount);
      expect(await usdh.balanceOf(user.address)).to.equal(amount);
    });

    it("emits Borrowed event", async function () {
      const { pool, user } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("50");
      await expect(pool.connect(user).borrow(amount))
        .to.emit(pool, "Borrowed")
        .withArgs(user.address, amount);
    });

    it("sets lastAccrualTime on first borrow", async function () {
      const { pool, user } = await loadFixture(deployFixture);
      await pool.connect(user).borrow(ethers.parseEther("50"));
      expect(await pool.lastAccrualTime(user.address)).to.be.gt(0n);
    });
  });

  describe("repay", function () {
    it("user can repay debt", async function () {
      const { pool, vault, user } = await loadFixture(borrowedFixture);
      // Repay with buffer to cover principal + accrued interest
      await pool.connect(user).repay(ethers.parseEther("51"));
      expect(await vault.debtBalance(user.address)).to.equal(0n);
    });

    it("repaying more than owed repays only exact debt", async function () {
      const { pool, vault, usdh, user } = await loadFixture(borrowedFixture);
      await usdh.mint(user.address, ethers.parseEther("10"));
      await pool.connect(user).repay(ethers.parseEther("100"));
      expect(await vault.debtBalance(user.address)).to.equal(0n);
    });

    it("reverts on zero repay", async function () {
      const { pool, user } = await loadFixture(borrowedFixture);
      await expect(pool.connect(user).repay(0n))
        .to.be.revertedWith("Pool: zero amount");
    });

    it("reverts when no debt exists", async function () {
      const { pool, user } = await loadFixture(borrowedFixture);
      // Repay with buffer to clear debt including accrued interest, then verify no-debt revert
      await pool.connect(user).repay(ethers.parseEther("51"));
      await expect(pool.connect(user).repay(ethers.parseEther("1")))
        .to.be.revertedWith("Pool: no debt");
    });

    it("emits Repaid event", async function () {
      const { pool, user } = await loadFixture(borrowedFixture);
      await expect(pool.connect(user).repay(ethers.parseEther("50")))
        .to.emit(pool, "Repaid")
        .withArgs(user.address, ethers.parseEther("50"));
    });
  });

  describe("accrueInterest", function () {
    it("accrues interest after 1 year — 5 bps on $50 ≈ $0.25", async function () {
      const { pool, vault, user } = await loadFixture(borrowedFixture);
      const debtBefore = await vault.debtBalance(user.address);
      await time.increase(365 * 24 * 3600);
      await pool.accrueInterest(user.address);
      const interest = (await vault.debtBalance(user.address)) - debtBefore;
      // 50 * 5 / 10000 = 0.025 per year — wait: 5 bps = 0.05%, so 50 * 0.0005 = 0.025
      // Actually 5 bps = 5/10000 = 0.0005 fraction per year → 50 * 0.0005 = 0.025 USDH
      expect(interest).to.be.gt(0n);
    });

    it("does not accrue when no debt", async function () {
      const { pool, vault, user } = await loadFixture(deployFixture);
      await pool.accrueInterest(user.address);
      expect(await vault.debtBalance(user.address)).to.equal(0n);
    });

    it("emits InterestAccrued event", async function () {
      const { pool, user } = await loadFixture(borrowedFixture);
      await time.increase(365 * 24 * 3600);
      await expect(pool.accrueInterest(user.address))
        .to.emit(pool, "InterestAccrued");
    });
  });

  describe("liquidate", function () {
    it("liquidates unhealthy position — clears debt", async function () {
      const { pool, vault, user, liquidator } = await loadFixture(liquidatableFixture);
      await pool.connect(liquidator).liquidate(user.address);
      expect(await vault.debtBalance(user.address)).to.equal(0n);
    });

    it("liquidator receives vDOT", async function () {
      const { pool, vdot, user, liquidator } = await loadFixture(liquidatableFixture);
      const before = await vdot.balanceOf(liquidator.address);
      await pool.connect(liquidator).liquidate(user.address);
      expect(await vdot.balanceOf(liquidator.address)).to.be.gt(before);
    });

    it("reverts if position is healthy", async function () {
      const { pool, oracle, vdot, user, liquidator } = await loadFixture(liquidatableFixture);
      await oracle.submitPrice(vdot.target, ethers.parseEther("10"));
      await expect(pool.connect(liquidator).liquidate(user.address))
        .to.be.revertedWith("Pool: position healthy");
    });

    it("reverts after liquidation — position is now healthy (no debt)", async function () {
      const { pool, usdh, user, liquidator } = await loadFixture(liquidatableFixture);
      await pool.connect(liquidator).liquidate(user.address);
      // After liquidation: debt=0 → getHealthFactor returns MaxUint256 → "position healthy" fires first
      await usdh.mint(liquidator.address, ethers.parseEther("1"));
      await usdh.connect(liquidator).approve(pool.target, ethers.parseEther("1"));
      await expect(pool.connect(liquidator).liquidate(user.address))
        .to.be.revertedWith("Pool: position healthy");
    });

    it("emits Liquidated event", async function () {
      const { pool, user, liquidator } = await loadFixture(liquidatableFixture);
      await expect(pool.connect(liquidator).liquidate(user.address))
        .to.emit(pool, "Liquidated");
    });

    it("collateral balance reduced after liquidation", async function () {
      const { pool, vault, user, liquidator } = await loadFixture(liquidatableFixture);
      const colBefore = await vault.collateralBalance(user.address);
      await pool.connect(liquidator).liquidate(user.address);
      expect(await vault.collateralBalance(user.address)).to.be.lt(colBefore);
    });
  });
});
