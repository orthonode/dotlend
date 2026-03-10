// scripts/deploy-wpas-market.js
// Deploys the Parallel Market for WPAS (Native PAS collateral).
// This deploys:
//  1. WPAS (ERC-20 Wrapper)
//  2. TreasuryRouter (for WPAS market fee collection)
//  3. CollateralVault (configured for WPAS)
//  4. LendingPool (configured for WPAS + TreasuryRouter)
// And wires them together.

const hre = require("hardhat");

const PRICE_ORACLE_ADDRESS = "0xc12D24cD6DF4521C9A453a325751bB1f38326a91";
const HOLLAR_ADDRESS = "0xA94f7464F3a2cA966CB31881A1614A9CF97859ca"; // Existing MockHOLLAR
const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS || "0x0000000000000000000000000000000000000000"; // Set your treasury wallet

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
  const treasuryAddr = TREASURY_ADDRESS === "0x0000000000000000000000000000000000000000"
    ? deployer.address
    : TREASURY_ADDRESS;

  console.log("=".repeat(60));
  console.log("DotLend WPAS Parallel Market Deploy");
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`Treasury:  ${treasuryAddr}`);
  console.log("=".repeat(60));

  // 1. Deploy WPAS
  console.log("\n[1/4] Deploying WPAS...");
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

  // 2. Deploy TreasuryRouter for WPAS market
  console.log("\n[2/4] Deploying TreasuryRouter (WPAS market)...");
  const TreasuryRouter = await hre.ethers.getContractFactory("TreasuryRouter");
  const router = await TreasuryRouter.deploy(HOLLAR_ADDRESS, treasuryAddr);
  await router.waitForDeployment();
  const routerAddress = await router.getAddress();
  console.log(`  TreasuryRouter:   ${routerAddress}`);

  // 3. Deploy WPAS Collateral Vault
  console.log("\n[3/4] Deploying CollateralVault (WPAS)...");
  const CollateralVault = await hre.ethers.getContractFactory("CollateralVault");
  const vault = await CollateralVault.deploy(wpasAddress, PRICE_ORACLE_ADDRESS);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log(`  CollateralVault:  ${vaultAddress}`);

  // 4. Deploy WPAS Lending Pool — uses TreasuryRouter, not raw HOLLAR
  console.log("\n[4/4] Deploying LendingPool (WPAS)...");
  const LendingPool = await hre.ethers.getContractFactory("LendingPool");
  const pool = await LendingPool.deploy(vaultAddress, routerAddress, PRICE_ORACLE_ADDRESS, wpasAddress);
  await pool.waitForDeployment();
  const poolAddress = await pool.getAddress();
  console.log(`  LendingPool:      ${poolAddress}`);

  // Wire
  console.log("\n[Wire] vault.setLendingPool(pool)...");
  const txWire1 = await vault.setLendingPool(poolAddress);
  await txWire1.wait();
  console.log("  Done.");

  console.log("[Wire] router.setLendingPool(pool)...");
  const txWire2 = await router.setLendingPool(poolAddress);
  await txWire2.wait();
  console.log("  Done.");

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOY COMPLETE (WPAS MARKET)");
  console.log("=".repeat(60));
  console.log("Copy these to frontend/src/lib/contracts.ts (MARKETS.wpas):");
  console.log(`  wpas:              "${wpasAddress}",`);
  console.log(`  collateralVault:   "${vaultAddress}",`);
  console.log(`  lendingPool:       "${poolAddress}",`);
  console.log(`  treasuryRouter:    "${routerAddress}",`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

