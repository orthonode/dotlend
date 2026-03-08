// test/SolvencyProof.test.js
// Tests for ZK solvency proof integration in LendingPool.
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

  // Deploy mocks
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
  const pool = await LendingPool.deploy(
    vault.target, hollar.target, oracle.target, vdot.target
  );
  await pool.waitForDeployment();

  // Wire vault to pool
  await vault.setLendingPool(pool.target);

  // Deploy ACCEPTING mock verifier
  const MockVerifier = await ethers.getContractFactory("MockSolvencyVerifier");
  const acceptingVerifier = await MockVerifier.deploy(true);
  await acceptingVerifier.waitForDeployment();

  // Deploy REJECTING mock verifier
  const rejectingVerifier = await MockVerifier.deploy(false);
  await rejectingVerifier.waitForDeployment();

  return { pool, vault, oracle, vdot, hollar, acceptingVerifier, rejectingVerifier, owner, alice, bob };
}

describe("SolvencyProof", function () {
  // ── Setup ──────────────────────────────────────────────────────────────────

  describe("setSolvencyVerifier", function () {
    it("owner can set verifier once", async function () {
      const { pool, acceptingVerifier } = await loadFixture(deployFixture);
      await pool.setSolvencyVerifier(acceptingVerifier.target);
      expect(await pool.solvencyVerifier()).to.equal(acceptingVerifier.target);
    });

    it("non-owner cannot set verifier", async function () {
      const { pool, acceptingVerifier, alice } = await loadFixture(deployFixture);
      await expect(
        pool.connect(alice).setSolvencyVerifier(acceptingVerifier.target)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("cannot set verifier twice", async function () {
      const { pool, acceptingVerifier, rejectingVerifier } = await loadFixture(deployFixture);
      await pool.setSolvencyVerifier(acceptingVerifier.target);
      await expect(
        pool.setSolvencyVerifier(rejectingVerifier.target)
      ).to.be.revertedWith("Pool: verifier already set");
    });

    it("reverts on zero address", async function () {
      const { pool } = await loadFixture(deployFixture);
      await expect(
        pool.setSolvencyVerifier(ethers.ZeroAddress)
      ).to.be.revertedWith("Pool: zero verifier");
    });
  });

  // ── publishSolvencyProof — valid proof ────────────────────────────────────

  describe("publishSolvencyProof — valid proof", function () {
    it("accepts valid proof and emits SolvencyProven", async function () {
      const { pool, acceptingVerifier } = await loadFixture(deployFixture);
      await pool.setSolvencyVerifier(acceptingVerifier.target);

      await expect(pool.publishSolvencyProof(DUMMY_PROOF, VALID_PUBLIC_INPUTS))
        .to.emit(pool, "SolvencyProven")
        .withArgs(VALID_PUBLIC_INPUTS[0], VALID_PUBLIC_INPUTS[1], VALID_PUBLIC_INPUTS[2]);
    });

    it("anyone can call publishSolvencyProof (permissionless)", async function () {
      const { pool, acceptingVerifier, alice } = await loadFixture(deployFixture);
      await pool.setSolvencyVerifier(acceptingVerifier.target);

      await expect(
        pool.connect(alice).publishSolvencyProof(DUMMY_PROOF, VALID_PUBLIC_INPUTS)
      ).to.emit(pool, "SolvencyProven");
    });

    it("emits correct collateral and debt values", async function () {
      const { pool, acceptingVerifier } = await loadFixture(deployFixture);
      await pool.setSolvencyVerifier(acceptingVerifier.target);

      const totalCollateral = ethers.parseEther("5000");
      const totalDebt = ethers.parseEther("2000");
      const timestamp = 1741435200n;

      const tx = await pool.publishSolvencyProof(DUMMY_PROOF, [totalCollateral, totalDebt, timestamp]);
      const receipt = await tx.wait();
      const event = receipt.logs.find(l => l.fragment?.name === "SolvencyProven");

      expect(event.args.totalCollateral).to.equal(totalCollateral);
      expect(event.args.totalDebt).to.equal(totalDebt);
      expect(event.args.timestamp).to.equal(timestamp);
    });
  });

  // ── publishSolvencyProof — invalid proof (insolvent state) ───────────────

  describe("publishSolvencyProof -- invalid proof", function () {
    it("reverts when verifier rejects proof", async function () {
      const { pool, rejectingVerifier } = await loadFixture(deployFixture);
      await pool.setSolvencyVerifier(rejectingVerifier.target);

      await expect(
        pool.publishSolvencyProof(DUMMY_PROOF, VALID_PUBLIC_INPUTS)
      ).to.be.revertedWith("Pool: invalid solvency proof");
    });

    it("reverts when verifier not set", async function () {
      const { pool } = await loadFixture(deployFixture);
      // No setSolvencyVerifier call
      await expect(
        pool.publishSolvencyProof(DUMMY_PROOF, VALID_PUBLIC_INPUTS)
      ).to.be.revertedWith("Pool: verifier not set");
    });

    it("reverts with wrong number of public inputs", async function () {
      const { pool, acceptingVerifier } = await loadFixture(deployFixture);
      await pool.setSolvencyVerifier(acceptingVerifier.target);

      const badInputs = [ethers.parseEther("1000"), ethers.parseEther("500")]; // missing timestamp
      await expect(
        pool.publishSolvencyProof(DUMMY_PROOF, badInputs)
      ).to.be.revertedWith("Pool: wrong input count");
    });

    it("insolvent proof rejected by verifier (collateral < debt)", async function () {
      const { pool, acceptingVerifier } = await loadFixture(deployFixture);
      await pool.setSolvencyVerifier(acceptingVerifier.target);

      // Set verifier to reject this specific proof
      await acceptingVerifier.setShouldAccept(false);

      const insolventInputs = [
        ethers.parseEther("100"),   // $100 collateral
        ethers.parseEther("200"),   // $200 debt -- INSOLVENT
        1741435200n,
      ];

      await expect(
        pool.publishSolvencyProof(DUMMY_PROOF, insolventInputs)
      ).to.be.revertedWith("Pool: invalid solvency proof");
    });
  });

  // ── Stale oracle timestamp ─────────────────────────────────────────────────

  describe("publishSolvencyProof -- stale oracle timestamp", function () {
    it("accepts proof with recent timestamp (mock verifier)", async function () {
      // Stale timestamp enforcement is in the circuit constraints.
      // The on-chain contract trusts the proof. The JS prover checks staleness.
      // This test confirms the contract itself passes through the timestamp.
      const { pool, acceptingVerifier } = await loadFixture(deployFixture);
      await pool.setSolvencyVerifier(acceptingVerifier.target);

      const staleTimestamp = 0n; // epoch -- clearly stale
      const inputs = [ethers.parseEther("1000"), ethers.parseEther("500"), staleTimestamp];

      // Contract does NOT enforce staleness on-chain (circuit does off-chain).
      // If verifier accepts, it goes through.
      await expect(
        pool.publishSolvencyProof(DUMMY_PROOF, inputs)
      ).to.emit(pool, "SolvencyProven").withArgs(inputs[0], inputs[1], inputs[2]);
    });

    it("stale proof rejected at verifier level", async function () {
      // In production, the real verifier enforces: oracle_timestamp > block.timestamp - 1 hour
      // Here we simulate verifier rejection for stale timestamps.
      const { pool, acceptingVerifier } = await loadFixture(deployFixture);
      await pool.setSolvencyVerifier(acceptingVerifier.target);

      await acceptingVerifier.setShouldAccept(false); // Simulate staleness rejection

      const staleInputs = [
        ethers.parseEther("1000"),
        ethers.parseEther("500"),
        0n, // stale timestamp
      ];

      await expect(
        pool.publishSolvencyProof(DUMMY_PROOF, staleInputs)
      ).to.be.revertedWith("Pool: invalid solvency proof");
    });
  });

  // ── Existing tests still pass ──────────────────────────────────────────────

  describe("existing borrow/repay unaffected", function () {
    it("can borrow after verifier is set", async function () {
      const { pool, vault, oracle, vdot, acceptingVerifier, alice } = await loadFixture(deployFixture);
      await pool.setSolvencyVerifier(acceptingVerifier.target);

      // Seed oracle
      await oracle.setAuthorizedOracle(await ethers.provider.getSigner(0).then(s => s.address));
      const [deployer] = await ethers.getSigners();
      await oracle.connect(deployer).submitPrice(vdot.target, ethers.parseEther("8.50"));

      // Deposit and borrow
      const amount = ethers.parseEther("10");
      await vdot.mint(alice.address, amount);
      await vdot.connect(alice).approve(vault.target, amount);
      await vault.connect(alice).deposit(amount);
      await pool.connect(alice).borrow(ethers.parseEther("50"));

      expect(await vault.debtBalance(alice.address)).to.equal(ethers.parseEther("50"));
    });
  });
});
