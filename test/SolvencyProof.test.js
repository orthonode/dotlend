// test/SolvencyProof.test.js
// Tests for ZK solvency proof integration via SolvencyGateway.
// Uses MockSolvencyVerifier — no actual ZK pairing in local tests.

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

// Dummy proof bytes — actual content irrelevant for mock verifier
const DUMMY_PROOF = ethers.hexlify(ethers.randomBytes(64));

// Public inputs: [total_collateral_value, total_debt, oracle_timestamp]
const VALID_PUBLIC_INPUTS = [
  ethers.parseEther("1000"),  // $1000 total collateral
  ethers.parseEther("500"),   // $500 total debt — solvent (2x collateral)
  1741435200n,                // oracle_timestamp: Mar 8 2026 12:00:00 UTC
];

async function deployFixture() {
  const [owner, alice, bob] = await ethers.getSigners();

  // Deploy protocol
  const PriceOracle = await ethers.getContractFactory("PriceOracle");
  const oracle = await PriceOracle.deploy();
  await oracle.waitForDeployment();

  const MockvDOT = await ethers.getContractFactory("MockvDOT");
  const vdot = await MockvDOT.deploy();
  await vdot.waitForDeployment();

  const MockHOLLAR = await ethers.getContractFactory("MockHOLLAR");
  const hollar = await MockHOLLAR.deploy();
  await hollar.waitForDeployment();

  const CollateralVault = await ethers.getContractFactory("CollateralVault");
  const vault = await CollateralVault.deploy(vdot.target, oracle.target);
  await vault.waitForDeployment();

  const LendingPool = await ethers.getContractFactory("LendingPool");
  const pool = await LendingPool.deploy(vault.target, hollar.target, oracle.target, vdot.target);
  await pool.waitForDeployment();
  await vault.setLendingPool(pool.target);

  // Deploy SolvencyGateway
  const SolvencyGateway = await ethers.getContractFactory("SolvencyGateway");
  const gateway = await SolvencyGateway.deploy();
  await gateway.waitForDeployment();

  // Deploy ACCEPTING mock verifier
  const MockVerifier = await ethers.getContractFactory("MockSolvencyVerifier");
  const acceptingVerifier = await MockVerifier.deploy(true);
  await acceptingVerifier.waitForDeployment();

  // Deploy REJECTING mock verifier
  const rejectingVerifier = await MockVerifier.deploy(false);
  await rejectingVerifier.waitForDeployment();

  return { pool, vault, oracle, vdot, hollar, gateway, acceptingVerifier, rejectingVerifier, owner, alice, bob };
}

describe("SolvencyProof", function () {
  // ── Setup ──────────────────────────────────────────────────────────────────

  describe("setSolvencyVerifier", function () {
    it("owner can set verifier once", async function () {
      const { gateway, acceptingVerifier } = await loadFixture(deployFixture);
      await gateway.setSolvencyVerifier(acceptingVerifier.target);
      expect(await gateway.solvencyVerifier()).to.equal(acceptingVerifier.target);
    });

    it("non-owner cannot set verifier", async function () {
      const { gateway, acceptingVerifier, alice } = await loadFixture(deployFixture);
      await expect(
        gateway.connect(alice).setSolvencyVerifier(acceptingVerifier.target)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("cannot set verifier twice", async function () {
      const { gateway, acceptingVerifier, rejectingVerifier } = await loadFixture(deployFixture);
      await gateway.setSolvencyVerifier(acceptingVerifier.target);
      await expect(
        gateway.setSolvencyVerifier(rejectingVerifier.target)
      ).to.be.revertedWith("Gateway: verifier already set");
    });

    it("reverts on zero address", async function () {
      const { gateway } = await loadFixture(deployFixture);
      await expect(
        gateway.setSolvencyVerifier(ethers.ZeroAddress)
      ).to.be.revertedWith("Gateway: zero verifier");
    });
  });

  // ── publishSolvencyProof — valid proof ────────────────────────────────────

  describe("publishSolvencyProof — valid proof", function () {
    it("accepts valid proof and emits SolvencyProven", async function () {
      const { gateway, acceptingVerifier } = await loadFixture(deployFixture);
      await gateway.setSolvencyVerifier(acceptingVerifier.target);

      await expect(gateway.publishSolvencyProof(DUMMY_PROOF, VALID_PUBLIC_INPUTS))
        .to.emit(gateway, "SolvencyProven")
        .withArgs(VALID_PUBLIC_INPUTS[0], VALID_PUBLIC_INPUTS[1], VALID_PUBLIC_INPUTS[2]);
    });

    it("anyone can call publishSolvencyProof (permissionless)", async function () {
      const { gateway, acceptingVerifier, alice } = await loadFixture(deployFixture);
      await gateway.setSolvencyVerifier(acceptingVerifier.target);

      await expect(
        gateway.connect(alice).publishSolvencyProof(DUMMY_PROOF, VALID_PUBLIC_INPUTS)
      ).to.emit(gateway, "SolvencyProven");
    });

    it("emits correct collateral and debt values", async function () {
      const { gateway, acceptingVerifier } = await loadFixture(deployFixture);
      await gateway.setSolvencyVerifier(acceptingVerifier.target);

      const totalCollateral = ethers.parseEther("5000");
      const totalDebt = ethers.parseEther("2000");
      const timestamp = 1741435200n;

      const tx = await gateway.publishSolvencyProof(DUMMY_PROOF, [totalCollateral, totalDebt, timestamp]);
      const receipt = await tx.wait();
      const event = receipt.logs.find(l => l.fragment?.name === "SolvencyProven");

      expect(event.args.totalCollateral).to.equal(totalCollateral);
      expect(event.args.totalDebt).to.equal(totalDebt);
      expect(event.args.timestamp).to.equal(timestamp);
    });
  });

  // ── publishSolvencyProof — invalid proof ─────────────────────────────────

  describe("publishSolvencyProof -- invalid proof", function () {
    it("reverts when verifier rejects proof", async function () {
      const { gateway, rejectingVerifier } = await loadFixture(deployFixture);
      await gateway.setSolvencyVerifier(rejectingVerifier.target);

      await expect(
        gateway.publishSolvencyProof(DUMMY_PROOF, VALID_PUBLIC_INPUTS)
      ).to.be.revertedWith("Gateway: invalid solvency proof");
    });

    it("reverts when verifier not set", async function () {
      const { gateway } = await loadFixture(deployFixture);
      await expect(
        gateway.publishSolvencyProof(DUMMY_PROOF, VALID_PUBLIC_INPUTS)
      ).to.be.revertedWith("Gateway: verifier not set");
    });

    it("reverts with wrong number of public inputs", async function () {
      const { gateway, acceptingVerifier } = await loadFixture(deployFixture);
      await gateway.setSolvencyVerifier(acceptingVerifier.target);

      const badInputs = [ethers.parseEther("1000"), ethers.parseEther("500")];
      await expect(
        gateway.publishSolvencyProof(DUMMY_PROOF, badInputs)
      ).to.be.revertedWith("Gateway: wrong input count");
    });

    it("insolvent proof rejected by verifier", async function () {
      const { gateway, acceptingVerifier } = await loadFixture(deployFixture);
      await gateway.setSolvencyVerifier(acceptingVerifier.target);
      await acceptingVerifier.setShouldAccept(false);

      await expect(
        gateway.publishSolvencyProof(DUMMY_PROOF, VALID_PUBLIC_INPUTS)
      ).to.be.revertedWith("Gateway: invalid solvency proof");
    });
  });

  // ── Stale oracle timestamp ─────────────────────────────────────────────────

  describe("publishSolvencyProof -- stale oracle timestamp", function () {
    it("accepts proof with any timestamp (staleness enforced by circuit)", async function () {
      const { gateway, acceptingVerifier } = await loadFixture(deployFixture);
      await gateway.setSolvencyVerifier(acceptingVerifier.target);

      const inputs = [ethers.parseEther("1000"), ethers.parseEther("500"), 0n];
      await expect(
        gateway.publishSolvencyProof(DUMMY_PROOF, inputs)
      ).to.emit(gateway, "SolvencyProven");
    });

    it("stale proof rejected at verifier level", async function () {
      const { gateway, acceptingVerifier } = await loadFixture(deployFixture);
      await gateway.setSolvencyVerifier(acceptingVerifier.target);
      await acceptingVerifier.setShouldAccept(false);

      await expect(
        gateway.publishSolvencyProof(DUMMY_PROOF, [ethers.parseEther("1000"), ethers.parseEther("500"), 0n])
      ).to.be.revertedWith("Gateway: invalid solvency proof");
    });
  });

  // ── Existing borrow/repay unaffected ──────────────────────────────────────

  describe("existing borrow/repay unaffected", function () {
    it("can borrow independently of gateway", async function () {
      const { pool, vault, oracle, vdot, alice } = await loadFixture(deployFixture);

      const [deployer] = await ethers.getSigners();
      await oracle.setAuthorizedOracle(deployer.address);
      await oracle.connect(deployer).submitPrice(vdot.target, ethers.parseEther("8.50"));

      const amount = ethers.parseEther("10");
      await vdot.mint(alice.address, amount);
      await vdot.connect(alice).approve(vault.target, amount);
      await vault.connect(alice).deposit(amount);
      await pool.connect(alice).borrow(ethers.parseEther("50"));

      expect(await vault.debtBalance(alice.address)).to.equal(ethers.parseEther("50"));
    });
  });
});
