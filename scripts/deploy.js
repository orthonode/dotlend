// scripts/deploy.js — Full protocol redeploy (both vDOT and WPAS markets)
//
// Reuses: MockvDOT, MockUSDH (existing token addresses — users keep their balances)
// Redeploys: PriceOracle, WPAS, TreasuryRouter × 2, CollateralVault × 2, LendingPool × 2
//
// Run:
//   npx hardhat run scripts/deploy.js --network polkadotHubTestnet

const { ethers } = require("hardhat");

// ── Reuse existing token contracts (users keep their token balances) ──────────
const VDOT_TOKEN = "0xfc1ACa9EDF5DA2eBEA5CE1320fb40A74Ac996544";
const USDH_TOKEN = "0x7d605b39a8EeF1aCA3D63bD7A32E2719abA87683";

async function deploy(name, ...args) {
  const Factory = await ethers.getContractFactory(name);
  const contract = await Factory.deploy(...args);
  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log(`   ${name}: ${addr}`);
  return { contract, addr };
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const treasury = process.env.TREASURY_ADDRESS || deployer.address;

  console.log("══════════════════════════════════════════════════");
  console.log("  DotLend Full Protocol Deploy");
  console.log("══════════════════════════════════════════════════");
  console.log(`  Deployer : ${deployer.address}`);
  console.log(`  Treasury : ${treasury}`);
  console.log(`  vDOT     : ${VDOT_TOKEN}  (reused)`);
  console.log(`  USDH     : ${USDH_TOKEN}  (reused)`);
  console.log("══════════════════════════════════════════════════\n");

  // ── 1. PriceOracle (updated: max price guard) ─────────────────────────────
  console.log("1. PriceOracle...");
  const { addr: oracleAddr } = await deploy("PriceOracle");

  // ── 2. WPAS token (updated: nonReentrant on withdraw) ────────────────────
  console.log("2. WPAS...");
  const { addr: wpasAddr } = await deploy("WPAS");

  // ── 3. vDOT market ────────────────────────────────────────────────────────
  console.log("3. vDOT market...");
  const { addr: vdotRouterAddr } = await deploy("TreasuryRouter", USDH_TOKEN, treasury);
  const { addr: vdotVaultAddr }  = await deploy("CollateralVault", VDOT_TOKEN, oracleAddr);
  const { contract: vdotPool, addr: vdotPoolAddr } = await deploy(
    "LendingPool", vdotVaultAddr, vdotRouterAddr, oracleAddr, VDOT_TOKEN
  );

  // Wire vDOT market
  console.log("   Wiring vDOT market...");
  const vdotVault = await ethers.getContractAt("CollateralVault", vdotVaultAddr);
  let tx = await vdotVault.setLendingPool(vdotPoolAddr);
  await tx.wait();
  const vdotRouter = await ethers.getContractAt("TreasuryRouter", vdotRouterAddr);
  tx = await vdotRouter.setLendingPool(vdotPoolAddr);
  await tx.wait();
  console.log("   vDOT market wired.");

  // ── 4. WPAS market ────────────────────────────────────────────────────────
  console.log("4. WPAS market...");
  const { addr: wpasRouterAddr } = await deploy("TreasuryRouter", USDH_TOKEN, treasury);
  const { addr: wpasVaultAddr }  = await deploy("CollateralVault", wpasAddr, oracleAddr);
  const { addr: wpasPoolAddr }   = (await deploy(
    "LendingPool", wpasVaultAddr, wpasRouterAddr, oracleAddr, wpasAddr
  ));

  // Wire WPAS market
  console.log("   Wiring WPAS market...");
  const wpasVault = await ethers.getContractAt("CollateralVault", wpasVaultAddr);
  tx = await wpasVault.setLendingPool(wpasPoolAddr);
  await tx.wait();
  const wpasRouter = await ethers.getContractAt("TreasuryRouter", wpasRouterAddr);
  tx = await wpasRouter.setLendingPool(wpasPoolAddr);
  await tx.wait();
  console.log("   WPAS market wired.");

  // ── 5. Set oracle authorized address ─────────────────────────────────────
  const oracleAuthorized = process.env.ORACLE_WALLET_ADDRESS;
  if (oracleAuthorized) {
    console.log(`5. Setting authorized oracle: ${oracleAuthorized}...`);
    const oracle = await ethers.getContractAt("PriceOracle", oracleAddr);
    tx = await oracle.setAuthorizedOracle(oracleAuthorized);
    await tx.wait();
    console.log("   Done.");
  } else {
    console.log("5. ORACLE_WALLET_ADDRESS not set — set it manually via:");
    console.log(`   oracle.setAuthorizedOracle(YOUR_ORACLE_ADDRESS)`);
  }

  // ── Output ────────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════");
  console.log("  DEPLOYMENT COMPLETE");
  console.log("══════════════════════════════════════════════════\n");
  console.log("Update frontend/src/lib/contracts.ts:\n");
  console.log("export const COMMON_ADDRESSES = {");
  console.log(`  priceOracle:     "${oracleAddr}" as \`0x\${string}\`,`);
  console.log(`  usdh:            "${USDH_TOKEN}" as \`0x\${string}\`,`);
  console.log(`  treasuryRouter:  "${vdotRouterAddr}" as \`0x\${string}\`,`);
  console.log("  solvencyGateway: \"<unchanged>\" as \`0x\${string}\`,");
  console.log("  xcmTreasuryDispatch: \"<unchanged>\" as \`0x\${string}\`,");
  console.log("};\n");
  console.log("export const MARKETS = {");
  console.log("  vdot: {");
  console.log(`    collateral:      "${VDOT_TOKEN}",`);
  console.log(`    collateralVault: "${vdotVaultAddr}",`);
  console.log(`    lendingPool:     "${vdotPoolAddr}",`);
  console.log(`    treasuryRouter:  "${vdotRouterAddr}",`);
  console.log("  },");
  console.log("  wpas: {");
  console.log(`    collateral:      "${wpasAddr}",`);
  console.log(`    collateralVault: "${wpasVaultAddr}",`);
  console.log(`    lendingPool:     "${wpasPoolAddr}",`);
  console.log(`    treasuryRouter:  "${wpasRouterAddr}",`);
  console.log("  },");
  console.log("};\n");
  console.log("Update oracle/.env:");
  console.log(`  PRICE_ORACLE_ADDRESS=${oracleAddr}`);
  console.log(`  COLLATERAL_VAULT_ADDRESS=${vdotVaultAddr}`);
  console.log(`  VDOT_ADDRESS=${VDOT_TOKEN}`);
}

main().catch(err => { console.error(err); process.exit(1); });
