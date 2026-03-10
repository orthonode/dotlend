// scripts/deploy-wpas.js
// Deploys WPAS (Wrapped PAS) and registers it in the existing PriceOracle
// with an initial price seeded from the deployer wallet.
//
// WPAS enables native PAS/DOT collateral in DotLend with zero changes to
// existing deployed contracts (CollateralVault, LendingPool, etc.)
//
// Run:
//   npx hardhat run scripts/deploy-wpas.js --network polkadotHubTestnet
//
// After running:
//   1. Copy WPAS_ADDRESS into oracle/.env as WPAS_ADDRESS
//   2. The oracle will auto-post DOT/WPAS prices on each tick
//   3. Users can: WPAS.deposit{value: x}() → CollateralVault.approve → CollateralVault.deposit

const { ethers } = require("hardhat");

// Existing deployed (unchanged) contracts
const PRICE_ORACLE_ADDRESS = "0xea7a8D7Dad04fD3B3Bf0242F3b7114b7CfcCBc1D";

// Initial DOT/PAS price in USD (update if stale at deploy time)
// The oracle will keep this current on each 30-min tick afterward.
const INITIAL_DOT_PRICE_USD = "5.00"; // $5.00 — adjust to live price

const PRICE_ORACLE_ABI = [
  {
    inputs: [
      { internalType: "address", name: "token",  type: "address" },
      { internalType: "uint256", name: "price",  type: "uint256" },
    ],
    name: "submitPrice",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "oracle", type: "address" }],
    name: "setAuthorizedOracle",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("");

  // ── 1. Deploy WPAS ───────────────────────────────────────────────────────
  console.log("1. Deploying WPAS...");
  const WPAS = await ethers.getContractFactory("WPAS");
  const wpas = await WPAS.deploy();
  await wpas.waitForDeployment();
  const wpasAddress = await wpas.getAddress();
  console.log("   WPAS deployed at:", wpasAddress);

  // ── 2. Seed initial price in PriceOracle ─────────────────────────────────
  console.log("");
  console.log("2. Seeding initial WPAS price in PriceOracle...");
  console.log("   PriceOracle:", PRICE_ORACLE_ADDRESS);

  const priceOracle = new ethers.Contract(
    PRICE_ORACLE_ADDRESS,
    PRICE_ORACLE_ABI,
    deployer
  );

  // Convert $X.XX → 1e18 scaled uint256
  const priceWei = ethers.parseUnits(INITIAL_DOT_PRICE_USD, 18);
  console.log(`   Initial price: $${INITIAL_DOT_PRICE_USD} (${priceWei} wei)`);

  try {
    const tx = await priceOracle.submitPrice(wpasAddress, priceWei);
    await tx.wait();
    console.log("   Price seeded. Tx:", tx.hash);
  } catch (err) {
    console.warn("   ⚠️  submitPrice failed (deployer may not be authorized oracle):");
    console.warn("   ", err.message);
    console.warn("   The oracle service will post the first live price on its next tick.");
  }

  // ── 3. Summary ───────────────────────────────────────────────────────────
  console.log("");
  console.log("════════════════════════════════════════════════════════════");
  console.log("WPAS DEPLOYED");
  console.log("════════════════════════════════════════════════════════════");
  console.log("");
  console.log("Add to oracle/.env:");
  console.log(`  WPAS_ADDRESS=${wpasAddress}`);
  console.log("");
  console.log("Add to frontend/src/lib/contracts.ts:");
  console.log(`  wpas: "${wpasAddress}",`);
  console.log("");
  console.log("Verify on explorer:");
  console.log(`  https://blockscout-testnet.polkadot.io/address/${wpasAddress}`);
  console.log("");
  console.log("How users interact:");
  console.log("  // 1. Wrap PAS → WPAS");
  console.log(`  wpas.deposit({ value: ethers.parseEther("10") })`);
  console.log("  // 2. Approve CollateralVault");
  console.log("  wpas.approve(COLLATERAL_VAULT, amount)");
  console.log("  // 3. Deposit as collateral (same as vDOT)");
  console.log("  collateralVault.deposit(amount)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
