const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

describe("TreasuryRouter", function () {
  async function deployFixture() {
    const [owner, user, treasury, liquidator] = await ethers.getSigners();

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

    const TreasuryRouter = await ethers.getContractFactory("TreasuryRouter");
    const router = await TreasuryRouter.deploy(usdh.target, treasury.address);
    await router.waitForDeployment();

    const CollateralVault = await ethers.getContractFactory("CollateralVault");
    const vault = await CollateralVault.deploy(vdot.target, oracle.target);
    await vault.waitForDeployment();

    const LendingPool = await ethers.getContractFactory("LendingPool");
    const pool = await LendingPool.deploy(vault.target, router.target, oracle.target, vdot.target);
    await pool.waitForDeployment();

    await vault.setLendingPool(pool.target);
    await router.setLendingPool(pool.target);

    await vdot.mint(user.address, ethers.parseEther("100"));
    await vdot.connect(user).approve(vault.target, ethers.parseEther("100"));
    await vault.connect(user).deposit(ethers.parseEther("10"));

    return { vault, vdot, usdh, oracle, pool, router, owner, user, treasury, liquidator };
  }

  async function borrowedFixture() {
    const ctx = await deployFixture();
    // Borrow 50 USDH — router.mint() intercepts and records principalDebt[user] = 50
    await ctx.pool.connect(ctx.user).borrow(ethers.parseEther("50"));
    // User approves router (not pool) for repayment
    await ctx.usdh.connect(ctx.user).approve(ctx.router.target, ethers.parseEther("100"));
    return ctx;
  }

  describe("deployment", function () {
    it("sets usdh and treasury correctly", async function () {
      const { router, usdh, treasury } = await loadFixture(deployFixture);
      expect(await router.usdh()).to.equal(usdh.target);
      expect(await router.treasury()).to.equal(treasury.address);
    });
    it("reverts on zero usdh address", async function () {
      const TreasuryRouter = await ethers.getContractFactory("TreasuryRouter");
      const [, , treasury] = await ethers.getSigners();
      await expect(TreasuryRouter.deploy(ethers.ZeroAddress, treasury.address))
        .to.be.revertedWith("TR: zero usdh");
    });
    it("reverts on zero treasury address", async function () {
      const TreasuryRouter = await ethers.getContractFactory("TreasuryRouter");
      const MockUSDH = await ethers.getContractFactory("MockUSDH");
      const usdh = await MockUSDH.deploy();
      await expect(TreasuryRouter.deploy(usdh.target, ethers.ZeroAddress))
        .to.be.revertedWith("TR: zero treasury");
    });
  });

  describe("setLendingPool", function () {
    it("owner can set lending pool", async function () {
      const { router, pool } = await loadFixture(deployFixture);
      expect(await router.lendingPool()).to.equal(pool.target);
    });
    it("reverts on zero address", async function () {
      const { router } = await loadFixture(deployFixture);
      await expect(router.setLendingPool(ethers.ZeroAddress))
        .to.be.revertedWith("TR: zero pool");
    });
  });

  describe("setTreasury", function () {
    it("owner can update treasury", async function () {
      const { router, liquidator } = await loadFixture(deployFixture);
      await router.setTreasury(liquidator.address);
      expect(await router.treasury()).to.equal(liquidator.address);
    });
    it("emits TreasuryUpdated event", async function () {
      const { router, liquidator } = await loadFixture(deployFixture);
      await expect(router.setTreasury(liquidator.address))
        .to.emit(router, "TreasuryUpdated")
        .withArgs(liquidator.address);
    });
    it("reverts on zero address", async function () {
      const { router } = await loadFixture(deployFixture);
      await expect(router.setTreasury(ethers.ZeroAddress))
        .to.be.revertedWith("TR: zero addr");
    });
  });

  describe("fee collection — principal burned, interest to treasury", function () {
    it("burns principal on repayment — no treasury balance change for principal-only repay", async function () {
      const { pool, usdh, router, user, treasury } = await loadFixture(borrowedFixture);
      const treasuryBefore = await usdh.balanceOf(treasury.address);
      const supplyBefore = await usdh.totalSupply();
      const repayAmount = ethers.parseEther("50");

      await pool.connect(user).repay(repayAmount);

      const treasuryAfter = await usdh.balanceOf(treasury.address);
      const supplyAfter = await usdh.totalSupply();

      // Principal (50 USDH) is burned — supply decreases
      expect(supplyBefore - supplyAfter).to.equal(repayAmount);
      // Treasury gets nothing for principal-only repay (no accrued interest yet)
      expect(treasuryAfter - treasuryBefore).to.equal(0n);
    });

    it("routes accrued interest to treasury, burns principal", async function () {
      const { pool, usdh, router, user, treasury } = await loadFixture(borrowedFixture);

      // Advance 1 year to accrue interest
      await time.increase(365 * 24 * 3600);

      // Give user extra USDH to cover interest before snapshot
      const MockUSDH = await ethers.getContractFactory("MockUSDH");
      await usdh.mint(user.address, ethers.parseEther("1")); // buffer for interest
      await usdh.connect(user).approve(router.target, ethers.parseEther("60"));

      // Capture supply AFTER extra mint so burn delta is accurate
      const supplyBefore = await usdh.totalSupply();
      const treasuryBefore = await usdh.balanceOf(treasury.address);

      // Repay exactly the accrued debt (principal + interest)
      // Use a large approval and let contract cap to actual debt
      await pool.connect(user).repay(ethers.parseEther("51")); // capped to actual debt

      const supplyAfter = await usdh.totalSupply();
      const treasuryAfter = await usdh.balanceOf(treasury.address);

      const burned = supplyBefore - supplyAfter;
      const feeToTreasury = treasuryAfter - treasuryBefore;

      // Total repaid = burned (principal) + fee (interest)
      const totalRepaid = burned + feeToTreasury;

      // Total repaid must be >= 50 USDH (principal)
      expect(totalRepaid).to.be.gte(ethers.parseEther("50"));
      // Treasury received the interest portion (> 0)
      expect(feeToTreasury).to.be.gt(0n);
      // Principal burned must be close to 50 (within 0.1 USDH)
      expect(burned).to.be.gte(ethers.parseEther("49.9"));
    });

    it("principalDebt tracked correctly after borrow", async function () {
      const { router, user } = await loadFixture(borrowedFixture);
      // After borrowing 50, router should track 50 as principal
      expect(await router.principalDebt(user.address)).to.equal(ethers.parseEther("50"));
    });

    it("principalDebt decreases after repay", async function () {
      const { pool, router, user } = await loadFixture(borrowedFixture);
      await pool.connect(user).repay(ethers.parseEther("50"));
      expect(await router.principalDebt(user.address)).to.equal(0n);
    });

    it("emits PrincipalBurned event on repay", async function () {
      const { pool, router, user } = await loadFixture(borrowedFixture);
      await expect(pool.connect(user).repay(ethers.parseEther("50")))
        .to.emit(router, "PrincipalBurned")
        .withArgs(user.address, ethers.parseEther("50"));
    });

    it("totalBurned increments by principal portion", async function () {
      const { pool, router, user } = await loadFixture(borrowedFixture);
      const burnedBefore = await router.totalBurned();
      await pool.connect(user).repay(ethers.parseEther("50"));
      expect(await router.totalBurned() - burnedBefore).to.equal(ethers.parseEther("50"));
    });
  });

  describe("burn — no-op", function () {
    it("burn() does nothing", async function () {
      const { router, usdh } = await loadFixture(deployFixture);
      const supplyBefore = await usdh.totalSupply();
      await router.burn(ethers.parseEther("1000"));
      const supplyAfter = await usdh.totalSupply();
      expect(supplyAfter).to.equal(supplyBefore);
    });
  });

  describe("passthrough", function () {
    it("forwards non-pool transferFrom transparently", async function () {
      const { router, usdh, user, liquidator } = await loadFixture(borrowedFixture);
      await usdh.connect(user).approve(router.target, ethers.parseEther("10"));
      const balBefore = await usdh.balanceOf(liquidator.address);
      await router.transferFrom(user.address, liquidator.address, ethers.parseEther("5"));
      const balAfter = await usdh.balanceOf(liquidator.address);
      expect(balAfter - balBefore).to.equal(ethers.parseEther("5"));
    });

    it("forwards mint() to real USDH and tracks principal", async function () {
      const { router, usdh, user } = await loadFixture(deployFixture);
      const balBefore = await usdh.balanceOf(user.address);
      const principalBefore = await router.principalDebt(user.address);
      await router.mint(user.address, ethers.parseEther("100"));
      const balAfter = await usdh.balanceOf(user.address);
      const principalAfter = await router.principalDebt(user.address);
      expect(balAfter - balBefore).to.equal(ethers.parseEther("100"));
      expect(principalAfter - principalBefore).to.equal(ethers.parseEther("100"));
    });
  });
});
