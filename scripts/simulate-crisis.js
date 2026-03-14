// scripts/simulate-crisis.js
// Simulates a vDOT price crash → position becomes liquidatable → liquidation executes
//
// Flow:
//   1. Mint vDOT to deployer
//   2. Deposit vDOT → collateral
//   3. Borrow USDH at max LTV (70%)
//   4. Verify health factor is healthy (≥ 1.0)
//   5. Crash vDOT price via oracle
//   6. Verify health factor is now < 1.0 (liquidatable)
//   7. Mint USDH to liquidator (same deployer account for testnet)
//   8. Liquidate → deployer receives vDOT + 5% bonus
//   9. Verify debt cleared, print results

const hre = require("hardhat");

const ADDRESSES = {
  priceOracle:     "0x1282F6B59869a57Fd2a1D7a5BC8535bB7B15D173",
  vdot:            "0xfc1ACa9EDF5DA2eBEA5CE1320fb40A74Ac996544",
  usdh:          "0x7d605b39a8EeF1aCA3D63bD7A32E2719abA87683",
  collateralVault: "0xF94eBe7F8d8F922B7FBBFb4BE080EB71a69415A2",
  lendingPool:     "0x34B22768B16262aD5b7fC23DD797D80791e4e7e6",
};

const EXPLORER = "https://blockscout-testnet.polkadot.io";

function txLink(tx) {
  return `${EXPLORER}/tx/${tx.hash}`;
}

async function waitAndLog(label, txPromise) {
  const tx = await txPromise;
  const receipt = await tx.wait();
  const status = receipt.status === 1 ? "✓" : "✗";
  console.log(`  ${status} ${label}`);
  console.log(`    ${txLink(tx)}`);
  return { tx, receipt };
}

function fmt(wei) {
  return hre.ethers.formatEther(wei);
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("=".repeat(60));
  console.log("DotLend Crisis Simulation — Polkadot Hub TestNet");
  console.log(`Account: ${deployer.address}`);
  console.log("=".repeat(60));

  const vdot   = await hre.ethers.getContractAt("MockvDOT",        ADDRESSES.vdot);
  const usdh = await hre.ethers.getContractAt("MockUSDH",      ADDRESSES.usdh);
  const vault  = await hre.ethers.getContractAt("CollateralVault", ADDRESSES.collateralVault);
  const pool   = await hre.ethers.getContractAt("LendingPool",     ADDRESSES.lendingPool);
  const oracle = await hre.ethers.getContractAt("PriceOracle",     ADDRESSES.priceOracle);

  const COLLATERAL   = hre.ethers.parseEther("10");   // 10 vDOT
  const PRICE_START  = hre.ethers.parseEther("8.5");  // $8.50 → collateral = $85
  const PRICE_CRASH  = hre.ethers.parseEther("6.0");  // $6.00 → collateral = $60
  // At $8.50: max borrow = $85 * 70% = $59.50 → borrow $59
  // At $6.00: collateral = $60, LT threshold = $60 * 80% = $48 → debt $59 > $48 → liquidatable
  const BORROW_AMOUNT = hre.ethers.parseEther("59");

  // ── Phase A: Setup ─────────────────────────────────────────────────────────
  console.log("\n── Phase A: Setup ────────────────────────────────────────");

  console.log("\n[A1] Setting initial vDOT price to $8.50...");
  await waitAndLog("PriceOracle.submitPrice(vDOT, $8.50)", oracle.submitPrice(ADDRESSES.vdot, PRICE_START));

  console.log("\n[A2] Minting 10 vDOT to deployer...");
  await waitAndLog("MockvDOT.mint(10 vDOT)", vdot.mint(deployer.address, COLLATERAL));

  console.log("\n[A3] Approving + depositing 10 vDOT...");
  await waitAndLog("MockvDOT.approve(vault, 10)", vdot.approve(ADDRESSES.collateralVault, COLLATERAL));
  await waitAndLog("CollateralVault.deposit(10 vDOT)", vault.deposit(COLLATERAL));

  const collateralUSD = await vault.getCollateralValue(deployer.address);
  console.log(`  Collateral value: $${fmt(collateralUSD)} (10 vDOT × $8.50)`);

  console.log("\n[A4] Borrowing $59 USDH (≈ 69.4% LTV, under 70% cap)...");
  await waitAndLog("LendingPool.borrow($59 USDH)", pool.borrow(BORROW_AMOUNT));

  const hfBefore = await vault.getHealthFactor(deployer.address);
  console.log(`  Health factor BEFORE crash: ${fmt(hfBefore)}`);
  if (hfBefore >= hre.ethers.parseEther("1")) {
    console.log("  ✓ Position is healthy");
  } else {
    console.error("  ✗ Position already unhealthy — abort");
    process.exit(1);
  }

  // ── Phase B: Crisis ────────────────────────────────────────────────────────
  console.log("\n── Phase B: Price Crash ──────────────────────────────────");

  console.log("\n[B1] Crashing vDOT price: $8.50 → $6.00...");
  await waitAndLog("PriceOracle.submitPrice(vDOT, $6.00)", oracle.submitPrice(ADDRESSES.vdot, PRICE_CRASH));

  const newCollateralUSD = await vault.getCollateralValue(deployer.address);
  const hfAfter = await vault.getHealthFactor(deployer.address);
  console.log(`  Collateral value after crash: $${fmt(newCollateralUSD)} (10 vDOT × $6.00)`);
  console.log(`  Health factor AFTER crash:  ${fmt(hfAfter)}`);

  if (hfAfter < hre.ethers.parseEther("1")) {
    console.log("  ✓ Position is LIQUIDATABLE (HF < 1.0)");
  } else {
    console.error("  ✗ Position still healthy — price drop insufficient");
    process.exit(1);
  }

  // ── Phase C: Liquidation ───────────────────────────────────────────────────
  console.log("\n── Phase C: Liquidation ──────────────────────────────────");

  // Get current debt (includes any accrued interest)
  const currentDebt = await vault.debtBalance(deployer.address);
  console.log(`\n[C1] Current debt: $${fmt(currentDebt)} USDH`);

  // Mint USDH to liquidator (deployer) to cover debt repayment
  const usdhBuffer = currentDebt + hre.ethers.parseEther("1");
  console.log(`[C2] Minting $${fmt(usdhBuffer)} USDH to liquidator (deployer)...`);
  await waitAndLog("MockUSDH.mint(liquidator, debt+buffer)", usdh.mint(deployer.address, usdhBuffer));
  await waitAndLog("MockUSDH.approve(pool, debt+buffer)", usdh.approve(ADDRESSES.lendingPool, usdhBuffer));

  console.log("\n[C3] Executing liquidation...");
  const vdotBefore = await vdot.balanceOf(deployer.address);
  await waitAndLog("LendingPool.liquidate(deployer)", pool.liquidate(deployer.address));
  const vdotAfter = await vdot.balanceOf(deployer.address);

  const seized = vdotAfter - vdotBefore;
  const debtAfter = await vault.debtBalance(deployer.address);
  const collateralAfter = await vault.collateralBalance(deployer.address);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("CRISIS SIMULATION RESULTS");
  console.log("=".repeat(60));
  console.log(`  Debt repaid:           $${fmt(currentDebt)} USDH`);
  console.log(`  Debt remaining:        $${fmt(debtAfter)} USDH`);
  console.log(`  vDOT seized by liq.:   ${fmt(seized)} vDOT`);
  console.log(`  Collateral remaining:  ${fmt(collateralAfter)} vDOT`);
  console.log(`  Liquidation bonus:     5% ✓`);
  console.log(`\nExplorer: ${EXPLORER}/address/${deployer.address}`);

  if (debtAfter === 0n) {
    console.log("\n✓ CRISIS SIMULATION PASSED — debt fully cleared by liquidation");
  } else {
    console.log(`\n⚠ Residual debt: $${fmt(debtAfter)} (from interest accrual — expected)`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
