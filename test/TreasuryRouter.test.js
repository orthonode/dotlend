const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("TreasuryRouter", function () {
  async function deployFixture() {
    const [owner, user, treasury, liquidator] = await ethers.getSigners();

    // Deploy mock tokens
    const MockvDOT = await ethers.getContractFactory("MockvDOT");
    const vdot = await MockvDOT.deploy();
    await vdot.waitForDeployment();

    const MockHOLLAR = await ethers.getContractFactory("MockHOLLAR");
    const hollar = await MockHOLLAR.deploy();
    await hollar.waitForDeployment();

    // Deploy oracle
    const PriceOracle = await ethers.getContractFactory("PriceOracle");
    const oracle = await PriceOracle.deploy();
    await oracle.waitForDeployment();
    await oracle.setAuthorizedOracle(owner.address);
    await oracle.submitPrice(vdot.target, ethers.parseEther("10")); // $10/vDOT

    // Deploy TreasuryRouter
    const TreasuryRouter = await ethers.getContractFactory("TreasuryRouter");
    const router = await TreasuryRouter.deploy(hollar.target, treasury.address);
    await router.waitForDeployment();

    // Deploy vault & pool (pool uses router as its hollar)
    const CollateralVault = await ethers.getContractFactory("CollateralVault");
    const vault = await CollateralVault.deploy(vdot.target, oracle.target);
    await vault.waitForDeployment();

    const LendingPool = await ethers.getContractFactory("LendingPool");
    const pool = await LendingPool.deploy(vault.target, router.target, oracle.target, vdot.target);
    await pool.waitForDeployment();

    // Wire
    await vault.setLendingPool(pool.target);
    await router.setLendingPool(pool.target);

    // Grant router mint/burn rights on HOLLAR
    // MockHOLLAR likely has open mint — grant router the ability to call hollar
    // For the router to call hollar.burn() and hollar.transfer(), it needs balance
    // The router calls hollar.transferFrom(user, router, amount) then hollar.transfer(treasury, amount)

    // Setup: user deposits 10 vDOT ($100 collateral)
    await vdot.mint(user.address, ethers.parseEther("100"));
    await vdot.connect(user).approve(vault.target, ethers.parseEther("100"));
    await vault.connect(user).deposit(ethers.parseEther("10"));

    return { vault, vdot, hollar, oracle, pool, router, owner, user, treasury, liquidator };
  }

  async function borrowedFixture() {
    const ctx = await deployFixture();
    // Borrow 50 HOLLAR
    await ctx.pool.connect(ctx.user).borrow(ethers.parseEther("50"));
    // User needs to approve the ROUTER (not pool) for repayment, since router pulls from user
    await ctx.hollar.connect(ctx.user).approve(ctx.router.target, ethers.parseEther("100"));
    return ctx;
  }

  describe("deployment", function () {
    it("sets hollar and treasury correctly", async function () {
      const { router, hollar, treasury } = await loadFixture(deployFixture);
      expect(await router.hollar()).to.equal(hollar.target);
      expect(await router.treasury()).to.equal(treasury.address);
    });

    it("reverts on zero hollar address", async function () {
      const TreasuryRouter = await ethers.getContractFactory("TreasuryRouter");
      const [, , treasury] = await ethers.getSigners();
      await expect(TreasuryRouter.deploy(ethers.ZeroAddress, treasury.address))
        .to.be.revertedWith("TR: zero hollar");
    });

    it("reverts on zero treasury address", async function () {
      const TreasuryRouter = await ethers.getContractFactory("TreasuryRouter");
      const MockHOLLAR = await ethers.getContractFactory("MockHOLLAR");
      const hollar = await MockHOLLAR.deploy();
      await expect(TreasuryRouter.deploy(hollar.target, ethers.ZeroAddress))
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

  describe("fee collection — 100% to treasury", function () {
    it("sends 100% of repayment to treasury", async function () {
      const { pool, hollar, router, user, treasury } = await loadFixture(borrowedFixture);

      const treasuryBefore = await hollar.balanceOf(treasury.address);
      const repayAmount = ethers.parseEther("50");

      await pool.connect(user).repay(repayAmount);

      const treasuryAfter = await hollar.balanceOf(treasury.address);
      // Treasury should receive the full repay amount
      expect(treasuryAfter - treasuryBefore).to.equal(repayAmount);
    });

    it("burns zero HOLLAR on repayment", async function () {
      const { pool, hollar, user } = await loadFixture(borrowedFixture);

      const totalSupplyBefore = await hollar.totalSupply();
      const repayAmount = ethers.parseEther("50");

      await pool.connect(user).repay(repayAmount);

      const totalSupplyAfter = await hollar.totalSupply();
      // Supply should decrease by repayAmount (the router doesn't burn, but
      // the HOLLAR was transferred from user's balance to treasury — supply unchanged)
      // Actually, minting happened for borrow, repay transfers to treasury, no burn occurs
      // So total supply should stay the same (50 minted, 50 transferred to treasury, 0 burned)
      expect(totalSupplyAfter).to.equal(totalSupplyBefore);
    });

    it("increments totalFeesCollected by full amount", async function () {
      const { pool, router, user } = await loadFixture(borrowedFixture);

      const feesBefore = await router.totalFeesCollected();
      const repayAmount = ethers.parseEther("50");

      await pool.connect(user).repay(repayAmount);

      const feesAfter = await router.totalFeesCollected();
      expect(feesAfter - feesBefore).to.equal(repayAmount);
    });

    it("emits ProtocolFeeCollected event", async function () {
      const { pool, router, user } = await loadFixture(borrowedFixture);

      const repayAmount = ethers.parseEther("50");

      // The event is emitted by the router, not the pool
      await expect(pool.connect(user).repay(repayAmount))
        .to.emit(router, "ProtocolFeeCollected")
        .withArgs(repayAmount);
    });
  });

  describe("burn — no-op", function () {
    it("burn() does nothing", async function () {
      const { router, hollar } = await loadFixture(deployFixture);
      const supplyBefore = await hollar.totalSupply();
      await router.burn(ethers.parseEther("1000"));
      const supplyAfter = await hollar.totalSupply();
      expect(supplyAfter).to.equal(supplyBefore);
    });
  });

  describe("passthrough", function () {
    it("forwards non-pool transferFrom transparently", async function () {
      const { router, hollar, user, liquidator } = await loadFixture(borrowedFixture);

      // Approve router to spend user HOLLAR
      await hollar.connect(user).approve(router.target, ethers.parseEther("10"));

      // transferFrom to a non-pool address should pass through
      const balBefore = await hollar.balanceOf(liquidator.address);
      await router.transferFrom(user.address, liquidator.address, ethers.parseEther("5"));
      const balAfter = await hollar.balanceOf(liquidator.address);
      expect(balAfter - balBefore).to.equal(ethers.parseEther("5"));
    });

    it("forwards mint() to real HOLLAR", async function () {
      const { router, hollar, user } = await loadFixture(deployFixture);
      const balBefore = await hollar.balanceOf(user.address);
      await router.mint(user.address, ethers.parseEther("100"));
      const balAfter = await hollar.balanceOf(user.address);
      expect(balAfter - balBefore).to.equal(ethers.parseEther("100"));
    });
  });
});
