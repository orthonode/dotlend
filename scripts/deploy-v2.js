// scripts/deploy-v2.js
// Deploys TreasuryRouter + CollateralVault + LendingPool.
// LendingPool.sol is UNCHANGED from original — no recompile size issues.
// TreasuryRouter is passed as the _hollar address to LendingPool.
//
// Run:
//   npx hardhat run scripts/deploy-v2.js --network polkadotHubTestnet

const { ethers } = require("hardhat");

// Existing deployed — unchanged
const PRICE_ORACLE = "0xea7a8D7Dad04fD3B3Bf0242F3b7114b7CfcCBc1D";
const VDOT         = "0x95Fa043b8acA6F73AfE03a3085E7Bfe53A5715CA";
const HOLLAR       = "0x2C8C4b2F63E50E566f9BA87EA4f75Caa368c2AAf";
const SOLVENCY_GW  = "0x6B682835bB25f7cA9e69D54B4B26e3A238Df66C0";

async function main() {
  const [deployer] = await ethers.getSigners();
  const treasury = process.env.TREASURY_ADDRESS || deployer.address;
  console.log("Deployer: ", deployer.address);
  console.log("Treasury: ", treasury);
  console.log("");

  // 1. Deploy TreasuryRouter
  console.log("1. Deploying TreasuryRouter...");
  const Router = await ethers.getContractFactory("TreasuryRouter");
  const router = await Router.deploy(HOLLAR, treasury);
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
  //    Pass ROUTER as _hollar — pool thinks it's talking to HOLLAR directly
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
  console.log(`  hollar:          "${HOLLAR}",`);
  console.log(`  solvencyGateway: "${SOLVENCY_GW}",`);
  console.log(`  treasury:        "${treasury}",`);
  console.log("");
  console.log("Also update oracle/.env:");
  console.log(`  COLLATERAL_VAULT_ADDRESS=${vaultAddress}`);
}

main().catch(err => { console.error(err); process.exit(1); });
