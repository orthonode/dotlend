// scripts/deploy-v2.js
// Deploys TreasuryRouter + CollateralVault + LendingPool.
// LendingPool.sol is UNCHANGED from original — no recompile size issues.
// TreasuryRouter is passed as the _usdh address to LendingPool.
//
// Run:
//   npx hardhat run scripts/deploy-v2.js --network polkadotHubTestnet

const { ethers } = require("hardhat");

// Existing deployed — unchanged
const PRICE_ORACLE = "0xc12D24cD6DF4521C9A453a325751bB1f38326a91";
const VDOT         = "0xa21443dfC33d44a4BaE8aA6fA6cA2A2d90F7F22F";
const USDH       = "0xA94f7464F3a2cA966CB31881A1614A9CF97859ca";
const SOLVENCY_GW  = "0x3e7D948769818C71075E38bbAA6198908Ba6CFAa";

async function main() {
  const [deployer] = await ethers.getSigners();
  const treasury = process.env.TREASURY_ADDRESS || deployer.address;
  console.log("Deployer: ", deployer.address);
  console.log("Treasury: ", treasury);
  console.log("");

  // 1. Deploy TreasuryRouter
  console.log("1. Deploying TreasuryRouter...");
  const Router = await ethers.getContractFactory("TreasuryRouter");
  const router = await Router.deploy(USDH, treasury);
  await router.waitForDeployment();
  const routerAddress = await router.getAddress();
  console.log("   TreasuryRouter:", routerAddress);

  // 2. Deploy CollateralVault (unchanged contract, new instance)
  console.log("2. Deploying CollateralVault...");
  const Vault = await ethers.getContractFactory("CollateralVault");
  const vault = await Vault.deploy(VDOT, PRICE_ORACLE);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("   CollateralVault:", vaultAddress);

  // 3. Deploy LendingPool — ORIGINAL UNCHANGED CONTRACT
  //    Pass ROUTER as _usdh — pool thinks it's talking to USDH directly
  console.log("3. Deploying LendingPool (original, unchanged)...");
  const Pool = await ethers.getContractFactory("LendingPool");
  const pool = await Pool.deploy(vaultAddress, routerAddress, PRICE_ORACLE, VDOT);
  await pool.waitForDeployment();
  const poolAddress = await pool.getAddress();
  console.log("   LendingPool:", poolAddress);

  // 4. Wire vault → pool
  console.log("4. vault.setLendingPool...");
  let tx = await vault.setLendingPool(poolAddress);
  await tx.wait();
  console.log("   Done.", tx.hash);

  // 5. Wire router → pool (so router knows which address is lendingPool)
  console.log("5. router.setLendingPool...");
  tx = await router.setLendingPool(poolAddress);
  await tx.wait();
  console.log("   Done.", tx.hash);

  console.log("");
  console.log("════════════════════════════════════════════");
  console.log("DEPLOYMENT COMPLETE");
  console.log("════════════════════════════════════════════");
  console.log("");
  console.log("Update frontend/src/lib/contracts.ts:");
  console.log(`  collateralVault: "${vaultAddress}",`);
  console.log(`  lendingPool:     "${poolAddress}",`);
  console.log(`  treasuryRouter:  "${routerAddress}",`);
  console.log("");
  console.log("Unchanged:");
  console.log(`  priceOracle:     "${PRICE_ORACLE}",`);
  console.log(`  vdot:            "${VDOT}",`);
  console.log(`  usdh:            "${USDH}",`);
  console.log(`  solvencyGateway: "${SOLVENCY_GW}",`);
  console.log(`  treasury:        "${treasury}",`);
  console.log("");
  console.log("Also update oracle/.env:");
  console.log(`  COLLATERAL_VAULT_ADDRESS=${vaultAddress}`);
}

main().catch(err => { console.error(err); process.exit(1); });
