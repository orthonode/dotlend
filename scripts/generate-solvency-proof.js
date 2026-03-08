// scripts/generate-solvency-proof.js
//
// DotLend ZK Solvency Prover
//
// 1. Reads all active positions from CollateralVault (via Deposited/Withdrawn events)
// 2. Fetches current vDOT price from PriceOracle
// 3. Builds the Noir circuit witness
// 4. Generates a ZK proof using @noir-lang/noir_js + @noir-lang/backend_barretenberg
// 5. Submits proof to LendingPool.publishSolvencyProof()
// 6. Prints Blockscout link
//
// Usage:
//   node scripts/generate-solvency-proof.js
//   (requires PRIVATE_KEY in .env, contracts must be deployed)

"use strict";

const hre = require("hardhat");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const ADDRESSES = {
  priceOracle:     "0x92eA8D8AF88a744c70fA3A6dd700819f2E606759",
  vdot:            "0x086Bd622eB3880f0eCCb8B86E0eB97f69b8dbD63",
  hollar:          "0xe5a9ea3dDEFfD3fC4C98b6B338abC0930f34C727",
  collateralVault: "0xff58177D585b5dB022B0773405a40bEC443E512a",
  lendingPool:     "0xA8b36339C55c664BBe7C59d2d59Abf91f472C8d0",
};

const EXPLORER = "https://blockscout-testnet.polkadot.io";
const MAX_USERS = 64; // must match circuits/solvency/src/main.nr

// Path to compiled Noir circuit artifact
const CIRCUIT_ARTIFACT = path.join(
  __dirname, "..", "circuits", "solvency", "target", "solvency.json"
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg) { console.log(`  ${msg}`); }
function section(msg) { console.log(`\n[${msg}]`); }

async function getActiveUsers(vault) {
  // Collect all addresses that ever deposited
  const depositFilter = vault.filters.Deposited();
  const depositEvents = await vault.queryFilter(depositFilter, 0, "latest");
  const uniqueUsers = [...new Set(depositEvents.map(e => e.args.user))];

  // Filter to those with non-zero collateral
  const active = [];
  for (const user of uniqueUsers) {
    const balance = await vault.collateralBalance(user);
    if (balance > 0n) active.push(user);
  }
  return active;
}

function toCircuitUnit(weiValue) {
  // Circuit uses u64 scaled to 1e9 (gwei units) to fit u64 range
  // 1 ether = 1e18 wei; u64 max ~ 1.8e19; so max ~18 ether in gwei = 18e9
  // For DotLend amounts (collateral < 1000 vDOT, debt < 10000 HOLLAR), gwei is safe
  return BigInt(weiValue) / 1_000_000_000n; // wei -> gwei
}

async function buildWitness(vault, oracle, vdotAddress, activeUsers) {
  const vdotPrice = await oracle.getPrice(vdotAddress); // wei (1e18 = $1)
  log(`vDOT price: $${hre.ethers.formatEther(vdotPrice)}`);

  const collateralValues = new Array(MAX_USERS).fill(0n);
  const debtAmounts = new Array(MAX_USERS).fill(0n);

  let sumCollateral = 0n;
  let sumDebt = 0n;

  for (let i = 0; i < activeUsers.length && i < MAX_USERS; i++) {
    const user = activeUsers[i];
    const collWei = await vault.collateralBalance(user);
    const debtWei = await vault.debtBalance(user);

    // collateral value in HOLLAR-wei: (collateral * price) / 1e18
    const collValueWei = (collWei * vdotPrice) / (10n ** 18n);

    // Convert to gwei-scale for u64
    const collGwei = toCircuitUnit(collValueWei);
    const debtGwei = toCircuitUnit(debtWei);

    collateralValues[i] = collGwei;
    debtAmounts[i] = debtGwei;
    sumCollateral += collGwei;
    sumDebt += debtGwei;

    log(`  User ${i}: collateral=$${hre.ethers.formatEther(collValueWei)} debt=$${hre.ethers.formatEther(debtWei)}`);
  }

  const timestamp = BigInt(Math.floor(Date.now() / 1000));

  return {
    // Private inputs (circuit witness)
    privateInputs: {
      collateral_values: collateralValues.map(String),
      debt_amounts: debtAmounts.map(String),
    },
    // Public inputs
    publicInputs: {
      total_collateral_value: String(sumCollateral),
      total_debt: String(sumDebt),
      oracle_timestamp: String(timestamp),
    },
    // For on-chain submission (uint256[])
    onchainPublicInputs: [
      sumCollateral * 1_000_000_000n,   // back to wei scale
      sumDebt * 1_000_000_000n,
      timestamp,
    ],
  };
}

async function generateProof(witness) {
  if (!fs.existsSync(CIRCUIT_ARTIFACT)) {
    throw new Error(
      `Circuit artifact not found at ${CIRCUIT_ARTIFACT}.\n` +
      `Run: cd circuits/solvency && nargo compile`
    );
  }

  log("Loading @noir-lang/noir_js and @noir-lang/backend_barretenberg...");
  const { Noir } = await import("@noir-lang/noir_js");
  const { UltraHonkBackend } = await import("@noir-lang/backend_barretenberg");

  const circuitJson = JSON.parse(fs.readFileSync(CIRCUIT_ARTIFACT, "utf8"));
  const backend = new UltraHonkBackend(circuitJson.bytecode);
  const noir = new Noir(circuitJson);

  log("Executing circuit to generate witness...");
  const { witness: witnessMap } = await noir.execute({
    ...witness.privateInputs,
    ...witness.publicInputs,
  });

  log("Generating UltraHonk proof...");
  const { proof, publicInputs } = await backend.generateProof(witnessMap);
  log(`Proof generated: ${proof.length} bytes`);

  return {
    proof: "0x" + Buffer.from(proof).toString("hex"),
    publicInputs,
  };
}

async function submitProof(pool, proof, onchainPublicInputs) {
  const tx = await pool.publishSolvencyProof(proof, onchainPublicInputs);
  const receipt = await tx.wait();
  const status = receipt.status === 1 ? "OK" : "FAIL";
  log(`Tx: ${tx.hash} | block: ${receipt.blockNumber} | status: ${status}`);
  log(`Explorer: ${EXPLORER}/tx/${tx.hash}`);
  return tx;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("=".repeat(60));
  console.log("DotLend ZK Solvency Prover");
  console.log(`Account: ${deployer.address}`);
  console.log("=".repeat(60));

  // Attach contracts
  const vault  = await hre.ethers.getContractAt("CollateralVault", ADDRESSES.collateralVault);
  const pool   = await hre.ethers.getContractAt("LendingPool",     ADDRESSES.lendingPool);
  const oracle = await hre.ethers.getContractAt("PriceOracle",     ADDRESSES.priceOracle);

  // Step 1: collect positions
  section("1. Scanning active positions...");
  const activeUsers = await getActiveUsers(vault);
  log(`Found ${activeUsers.length} active user(s)`);

  if (activeUsers.length === 0) {
    log("No active positions — protocol trivially solvent. Skipping proof.");
    process.exit(0);
  }

  // Step 2: build witness
  section("2. Building circuit witness...");
  const witness = await buildWitness(vault, oracle, ADDRESSES.vdot, activeUsers);
  log(`Total collateral (gwei): ${witness.publicInputs.total_collateral_value}`);
  log(`Total debt (gwei):       ${witness.publicInputs.total_debt}`);

  const collateral = BigInt(witness.publicInputs.total_collateral_value);
  const debt = BigInt(witness.publicInputs.total_debt);
  if (collateral <= debt) {
    console.error("\nERROR: Protocol appears INSOLVENT. Proof would fail circuit constraint.");
    process.exit(1);
  }
  log(`Solvency ratio: ${(Number(collateral) / Number(debt)).toFixed(3)}x (healthy)`);

  // Step 3: generate proof
  section("3. Generating ZK proof...");
  const { proof } = await generateProof(witness);

  // Step 4: submit
  section("4. Submitting proof to LendingPool...");
  await submitProof(pool, proof, witness.onchainPublicInputs);

  console.log("\n" + "=".repeat(60));
  console.log("SOLVENCY PROOF PUBLISHED");
  console.log("DotLend solvency is cryptographically proven, not assumed.");
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
