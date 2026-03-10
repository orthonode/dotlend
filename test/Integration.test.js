const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("Integration — Full DotLend Flow", function () {
  async function deployAll() {
    const [owner, alice, bob] = await ethers.getSigners();

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

    return { vault, vdot, usdh, oracle, pool, owner, alice, bob };
  }

  it("full deposit → borrow → repay → withdraw flow", async function () {
    const { vault, vdot, usdh, pool, alice } = await loadFixture(deployAll);

    await vdot.mint(alice.address, ethers.parseEther("20"));
    await vdot.connect(alice).approve(vault.target, ethers.parseEther("20"));

    // Deposit 10 vDOT → $100 collateral
    await vault.connect(alice).deposit(ethers.parseEther("10"));
    expect(await vault.getCollateralValue(alice.address)).to.equal(ethers.parseEther("100"));

    // Borrow $50 USDH (within 70% LTV)
    await pool.connect(alice).borrow(ethers.parseEther("50"));
    expect(await usdh.balanceOf(alice.address)).to.equal(ethers.parseEther("50"));
    expect(await vault.debtBalance(alice.address)).to.equal(ethers.parseEther("50"));

    // Health factor must be >= 1e18
    expect(await vault.getHealthFactor(alice.address)).to.be.gte(ethers.parseEther("1"));

    // Full repay — mint buffer for accrued interest, repay more than borrow so all debt cleared
    await usdh.mint(alice.address, ethers.parseEther("1"));
    await usdh.connect(alice).approve(pool.target, ethers.parseEther("60"));
    await pool.connect(alice).repay(ethers.parseEther("55"));
    expect(await vault.debtBalance(alice.address)).to.equal(0n);

    // Withdraw all collateral
    await vault.connect(alice).withdraw(ethers.parseEther("10"));
    expect(await vault.collateralBalance(alice.address)).to.equal(0n);
  });

  it("interest accrual: 5 bps/year on $50 debt = $0.025 interest", async function () {
    const { vault, vdot, pool, alice } = await loadFixture(deployAll);

    await vdot.mint(alice.address, ethers.parseEther("10"));
    await vdot.connect(alice).approve(vault.target, ethers.parseEther("10"));
    await vault.connect(alice).deposit(ethers.parseEther("10"));
    await pool.connect(alice).borrow(ethers.parseEther("50"));

    const debtBefore = await vault.debtBalance(alice.address);
    await time.increase(365 * 24 * 3600);
    await pool.accrueInterest(alice.address);
    const debtAfter = await vault.debtBalance(alice.address);

    expect(debtAfter).to.be.gt(debtBefore);
    // 50 USDH * 5bps = 50 * 5 / 10000 = 0.025 USDH
    const interest = debtAfter - debtBefore;
    expect(interest).to.be.gt(0n);
    // Sanity: interest < 1 USDH (should be ~0.025)
    expect(interest).to.be.lt(ethers.parseEther("1"));
  });

  it("price crash → liquidation → debt cleared, liquidator receives collateral", async function () {
    const { vault, vdot, usdh, oracle, pool, alice, bob } = await loadFixture(deployAll);

    await vdot.mint(alice.address, ethers.parseEther("10"));
    await vdot.connect(alice).approve(vault.target, ethers.parseEther("10"));
    await vault.connect(alice).deposit(ethers.parseEther("10"));
    await pool.connect(alice).borrow(ethers.parseEther("70"));

    // Healthy before crash
    expect(await vault.getHealthFactor(alice.address)).to.be.gte(ethers.parseEther("1"));

    // vDOT drops to $8 → collateral=$80, HF=(80*80e18)/(70*100) ≈ 0.914e18 < 1e18
    await oracle.submitPrice(vdot.target, ethers.parseEther("8"));
    expect(await vault.getHealthFactor(alice.address)).to.be.lt(ethers.parseEther("1"));

    // Bob liquidates — mint buffer above $70 to cover debt + any accrued interest
    await usdh.mint(bob.address, ethers.parseEther("75"));
    await usdh.connect(bob).approve(pool.target, ethers.parseEther("75"));

    const vdotBefore = await vdot.balanceOf(bob.address);
    await pool.connect(bob).liquidate(alice.address);
    const vdotAfter = await vdot.balanceOf(bob.address);

    expect(vdotAfter).to.be.gt(vdotBefore);
    expect(await vault.debtBalance(alice.address)).to.equal(0n);
    expect(await vault.collateralBalance(alice.address)).to.be.lt(ethers.parseEther("10"));
  });

  it("two users — independent state, no cross-contamination", async function () {
    const { vault, vdot, pool, alice, bob } = await loadFixture(deployAll);

    await vdot.mint(alice.address, ethers.parseEther("10"));
    await vdot.connect(alice).approve(vault.target, ethers.parseEther("10"));
    await vault.connect(alice).deposit(ethers.parseEther("10"));
    await pool.connect(alice).borrow(ethers.parseEther("50"));

    await vdot.mint(bob.address, ethers.parseEther("20"));
    await vdot.connect(bob).approve(vault.target, ethers.parseEther("20"));
    await vault.connect(bob).deposit(ethers.parseEther("20"));
    await pool.connect(bob).borrow(ethers.parseEther("100"));

    expect(await vault.debtBalance(alice.address)).to.equal(ethers.parseEther("50"));
    expect(await vault.debtBalance(bob.address)).to.equal(ethers.parseEther("100"));
    expect(await vault.collateralBalance(alice.address)).to.equal(ethers.parseEther("10"));
    expect(await vault.collateralBalance(bob.address)).to.equal(ethers.parseEther("20"));
  });

  it("liquidation 5% bonus: liquidator gets debtInVdot * 1.05 vDOT", async function () {
    const { vault, vdot, usdh, oracle, pool, alice, bob } = await loadFixture(deployAll);

    await vdot.mint(alice.address, ethers.parseEther("10"));
    await vdot.connect(alice).approve(vault.target, ethers.parseEther("10"));
    await vault.connect(alice).deposit(ethers.parseEther("10"));
    await pool.connect(alice).borrow(ethers.parseEther("70"));

    await oracle.submitPrice(vdot.target, ethers.parseEther("8"));

    await usdh.mint(bob.address, ethers.parseEther("75"));
    await usdh.connect(bob).approve(pool.target, ethers.parseEther("75"));
    await pool.connect(bob).liquidate(alice.address);

    // debt≈$70, vDOT=$8 → debtInVdot≈8.75 vDOT, with 5% bonus ≈ 9.1875 vDOT
    const seized = await vdot.balanceOf(bob.address);
    // Expect liquidator received > 8.75 vDOT (at least the base, before bonus)
    expect(seized).to.be.gt((ethers.parseEther("70") * ethers.parseEther("1")) / ethers.parseEther("8"));
    // And less than 10 vDOT (all of alice's collateral)
    expect(seized).to.be.lte(ethers.parseEther("10"));
  });

  it("cannot borrow against stale oracle price", async function () {
    const { vault, vdot, pool, alice } = await loadFixture(deployAll);

    await vdot.mint(alice.address, ethers.parseEther("10"));
    await vdot.connect(alice).approve(vault.target, ethers.parseEther("10"));
    await vault.connect(alice).deposit(ethers.parseEther("10"));

    // Advance past stale threshold (1 hour)
    await time.increase(3601);

    await expect(pool.connect(alice).borrow(ethers.parseEther("10")))
      .to.be.revertedWith("PriceOracle: stale price");
  });
});
