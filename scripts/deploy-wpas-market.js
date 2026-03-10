// scripts/deploy-wpas-market.js
// Deploys the Parallel Market for WPAS (Native PAS collateral).
// This deploys:
//  1. WPAS (ERC-20 Wrapper)
//  2. CollateralVault (configured for WPAS)
//  3. LendingPool (configured for WPAS + existing MockHOLLAR)
// And wires them together.

const hre = require("hardhat");

const PRICE_ORACLE_ADDRESS = "0xea7a8D7Dad04fD3B3Bf0242F3b7114b7CfcCBc1D";
const HOLLAR_ADDRESS = "0x2C8C4b2F63E50E566f9BA87EA4f75Caa368c2AAf"; // Existing MockHOLLAR

const INITIAL_DOT_PRICE_USD = "5.00"; 

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
  }
];

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("=".repeat(60));
  console.log("DotLend WPAS Parallel Market Deploy");
  console.log(`Deployer: ${deployer.address}`);
  console.log("=".repeat(60));

  // 1. Deploy WPAS
  console.log("\n[1/3] Deploying WPAS...");
  const WPAS = await hre.ethers.getContractFactory("WPAS");
  const wpas = await WPAS.deploy();
  await wpas.waitForDeployment();
  const wpasAddress = await wpas.getAddress();
  console.log(`  WPAS:             ${wpasAddress}`);

  // Seed price
  const priceOracle = new hre.ethers.Contract(PRICE_ORACLE_ADDRESS, PRICE_ORACLE_ABI, deployer);
  const priceWei = hre.ethers.parseUnits(INITIAL_DOT_PRICE_USD, 18);
  try {
    const tx = await priceOracle.submitPrice(wpasAddress, priceWei);
    await tx.wait();
    console.log(`  Seeded Price:     $${INITIAL_DOT_PRICE_USD}`);
  } catch (err) {
    console.log(`  [Note] Could not seed price: ${err.message}`);
  }

  // 2. Deploy WPAS Collateral Vault
  console.log("\n[2/3] Deploying CollateralVault (WPAS)...");
  const CollateralVault = await hre.ethers.getContractFactory("CollateralVault");
  const vault = await CollateralVault.deploy(wpasAddress, PRICE_ORACLE_ADDRESS);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log(`  CollateralVault:  ${vaultAddress}`);

  // 3. Deploy WPAS Lending Pool
  console.log("\n[3/3] Deploying LendingPool (WPAS)...");
  const LendingPool = await hre.ethers.getContractFactory("LendingPool");
  const pool = await LendingPool.deploy(vaultAddress, HOLLAR_ADDRESS, PRICE_ORACLE_ADDRESS, wpasAddress);
  await pool.waitForDeployment();
  const poolAddress = await pool.getAddress();
  console.log(`  LendingPool:      ${poolAddress}`);

  // Wire
  console.log("\n[Wire] vault.setLendingPool(pool)...");
  const txWire = await vault.setLendingPool(poolAddress);
  await txWire.wait();
  console.log("  Done.");

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOY COMPLETE (WPAS MARKET)");
  console.log("=".repeat(60));
  console.log("Copy these to frontend/src/lib/contracts.ts (MARKETS.wpas):");
  console.log(`  wpas:            "${wpasAddress}",`);
  console.log(`  collateralVault: "${vaultAddress}",`);
  console.log(`  lendingPool:     "${poolAddress}",`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
