const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("CollateralVault", function () {
  async function deployFixture() {
    const [owner, lendingPool, user, other] = await ethers.getSigners();

    const MockvDOT = await ethers.getContractFactory("MockvDOT");
    const vdot = await MockvDOT.deploy();
    await vdot.waitForDeployment();

    const PriceOracle = await ethers.getContractFactory("PriceOracle");
    const oracle = await PriceOracle.deploy();
    await oracle.waitForDeployment();
    await oracle.setAuthorizedOracle(owner.address);
    await oracle.submitPrice(vdot.target, ethers.parseEther("10")); // $10/vDOT

    const CollateralVault = await ethers.getContractFactory("CollateralVault");
    const vault = await CollateralVault.deploy(vdot.target, oracle.target);
    await vault.waitForDeployment();
    await vault.setLendingPool(lendingPool.address);

    await vdot.mint(user.address, ethers.parseEther("100"));
    await vdot.connect(user).approve(vault.target, ethers.parseEther("100"));

    return { vault, vdot, oracle, owner, lendingPool, user, other };
  }

  async function depositFixture() {
    const ctx = await deployFixture();
    await ctx.vault.connect(ctx.user).deposit(ethers.parseEther("10"));
    return ctx;
  }

  // Full protocol fixture — vault wired to actual LendingPool (needed for withdraw+debt tests)
  async function fullProtocolDepositFixture() {
    const [owner, user, other] = await ethers.getSigners();

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
    await usdh.transferOwnership(pool.target);

    await vdot.mint(user.address, ethers.parseEther("100"));
    await vdot.connect(user).approve(vault.target, ethers.parseEther("100"));

    await vault.connect(user).deposit(ethers.parseEther("10"));

    return { vault, vdot, usdh, oracle, pool, owner, user, other };
  }

  describe("setLendingPool", function () {
    it("owner can set lending pool", async function () {
      const { vault, lendingPool } = await loadFixture(deployFixture);
      expect(await vault.lendingPool()).to.equal(lendingPool.address);
    });

    it("non-owner cannot set lending pool", async function () {
      const { vault, user, other } = await loadFixture(deployFixture);
      await expect(vault.connect(user).setLendingPool(other.address))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("reverts on zero address", async function () {
      // Deploy a fresh vault (pool not yet set) to test zero-address guard
      const [owner] = await ethers.getSigners();
      const MockvDOT = await ethers.getContractFactory("MockvDOT");
      const vdot = await MockvDOT.deploy();
      const PriceOracle = await ethers.getContractFactory("PriceOracle");
      const oracle = await PriceOracle.deploy();
      const CollateralVault = await ethers.getContractFactory("CollateralVault");
      const freshVault = await CollateralVault.deploy(vdot.target, oracle.target);
      await expect(freshVault.setLendingPool(ethers.ZeroAddress))
        .to.be.revertedWith("Vault: zero pool");
    });

    it("reverts if lending pool already set", async function () {
      const { vault, other } = await loadFixture(deployFixture);
      await expect(vault.setLendingPool(other.address))
        .to.be.revertedWith("Vault: pool already set");
    });
  });

  describe("deposit", function () {
    it("user can deposit vDOT", async function () {
      const { vault, user } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("10");
      await vault.connect(user).deposit(amount);
      expect(await vault.collateralBalance(user.address)).to.equal(amount);
    });

    it("reverts on zero deposit", async function () {
      const { vault, user } = await loadFixture(deployFixture);
      await expect(vault.connect(user).deposit(0n))
        .to.be.revertedWith("Vault: zero amount");
    });

    it("emits Deposited event", async function () {
      const { vault, user } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("10");
      await expect(vault.connect(user).deposit(amount))
        .to.emit(vault, "Deposited")
        .withArgs(user.address, amount);
    });

    it("transfers vDOT from user to vault", async function () {
      const { vault, vdot, user } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("10");
      const before = await vdot.balanceOf(vault.target);
      await vault.connect(user).deposit(amount);
      expect(await vdot.balanceOf(vault.target)).to.equal(before + amount);
    });
  });

  describe("withdraw", function () {
    it("user can withdraw with no debt", async function () {
      const { vault, user } = await loadFixture(depositFixture);
      await vault.connect(user).withdraw(ethers.parseEther("5"));
      expect(await vault.collateralBalance(user.address)).to.equal(ethers.parseEther("5"));
    });

    it("reverts on zero withdrawal", async function () {
      const { vault, user } = await loadFixture(depositFixture);
      await expect(vault.connect(user).withdraw(0n))
        .to.be.revertedWith("Vault: zero amount");
    });

    it("reverts if insufficient collateral", async function () {
      const { vault, user } = await loadFixture(depositFixture);
      await expect(vault.connect(user).withdraw(ethers.parseEther("20")))
        .to.be.revertedWith("Vault: insufficient collateral");
    });

    it("reverts if withdrawal breaches LTV", async function () {
      const { vault, pool, usdh, user } = await loadFixture(fullProtocolDepositFixture);
      // 10 vDOT * $10 = $100. Borrow $70 (max LTV). Withdraw 5 vDOT → new collateral=$50, max debt=$35 → FAIL
      await usdh.connect(user).approve(pool.target, ethers.MaxUint256);
      await pool.connect(user).borrow(ethers.parseEther("70"));
      await expect(vault.connect(user).withdraw(ethers.parseEther("5")))
        .to.be.revertedWith("Vault: below LTV after withdrawal");
    });

    it("allows partial withdrawal within LTV", async function () {
      const { vault, pool, usdh, user } = await loadFixture(fullProtocolDepositFixture);
      // Borrow $10. Withdraw 5 vDOT → new collateral=$50, max debt=$35. $10 < $35 → OK
      await usdh.connect(user).approve(pool.target, ethers.MaxUint256);
      await pool.connect(user).borrow(ethers.parseEther("10"));
      await vault.connect(user).withdraw(ethers.parseEther("5"));
      expect(await vault.collateralBalance(user.address)).to.equal(ethers.parseEther("5"));
    });

    it("emits Withdrawn event", async function () {
      const { vault, user } = await loadFixture(depositFixture);
      const amount = ethers.parseEther("5");
      await expect(vault.connect(user).withdraw(amount))
        .to.emit(vault, "Withdrawn")
        .withArgs(user.address, amount);
    });
  });

  describe("getCollateralValue", function () {
    it("returns 0 for user with no collateral", async function () {
      const { vault, other } = await loadFixture(deployFixture);
      expect(await vault.getCollateralValue(other.address)).to.equal(0n);
    });

    it("returns correct USD value — 10 vDOT * $10 = $100", async function () {
      const { vault, user } = await loadFixture(depositFixture);
      expect(await vault.getCollateralValue(user.address)).to.equal(ethers.parseEther("100"));
    });
  });

  describe("getHealthFactor", function () {
    it("returns max uint256 for user with no debt", async function () {
      const { vault, user } = await loadFixture(depositFixture);
      expect(await vault.getHealthFactor(user.address)).to.equal(ethers.MaxUint256);
    });

    it("returns HF < 1e18 when debt exceeds liquidation threshold", async function () {
      const { vault, user, lendingPool } = await loadFixture(depositFixture);
      // $100 collateral, $90 debt → HF = (100*80*1e18)/(90*100) < 1e18
      await vault.connect(lendingPool).setDebt(user.address, ethers.parseEther("90"));
      expect(await vault.getHealthFactor(user.address)).to.be.lt(ethers.parseEther("1"));
    });

    it("returns HF >= 1e18 when position is healthy", async function () {
      const { vault, user, lendingPool } = await loadFixture(depositFixture);
      // $100 collateral, $70 debt → HF = (100*80*1e18)/(70*100) > 1e18
      await vault.connect(lendingPool).setDebt(user.address, ethers.parseEther("70"));
      expect(await vault.getHealthFactor(user.address)).to.be.gte(ethers.parseEther("1"));
    });
  });

  describe("setDebt / seizeCollateral (onlyLendingPool)", function () {
    it("lending pool can set debt", async function () {
      const { vault, user, lendingPool } = await loadFixture(deployFixture);
      await vault.connect(lendingPool).setDebt(user.address, ethers.parseEther("50"));
      expect(await vault.debtBalance(user.address)).to.equal(ethers.parseEther("50"));
    });

    it("non-lending-pool cannot set debt", async function () {
      const { vault, user } = await loadFixture(deployFixture);
      await expect(vault.connect(user).setDebt(user.address, 1n))
        .to.be.revertedWith("Vault: only lending pool");
    });

    it("lending pool can seize collateral", async function () {
      const { vault, user, lendingPool, other } = await loadFixture(depositFixture);
      await vault.connect(lendingPool).seizeCollateral(user.address, ethers.parseEther("5"), other.address);
      expect(await vault.collateralBalance(user.address)).to.equal(ethers.parseEther("5"));
    });

    it("seizeCollateral reverts if insufficient collateral", async function () {
      const { vault, user, lendingPool, other } = await loadFixture(depositFixture);
      await expect(vault.connect(lendingPool).seizeCollateral(user.address, ethers.parseEther("20"), other.address))
        .to.be.revertedWith("Vault: insufficient collateral to seize");
    });

    it("non-lending-pool cannot seize collateral", async function () {
      const { vault, user, other } = await loadFixture(depositFixture);
      await expect(vault.connect(user).seizeCollateral(user.address, ethers.parseEther("1"), other.address))
        .to.be.revertedWith("Vault: only lending pool");
    });
  });
});
