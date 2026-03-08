// scripts/interact.js
// End-to-end DotLend flow on Polkadot Hub TestNet:
//   mint vDOT → deposit → borrow HOLLAR → repay → withdraw
// Uses deployer account. Prints Blockscout links for every tx.

const hre = require("hardhat");

const ADDRESSES = {
  priceOracle:     "0x92eA8D8AF88a744c70fA3A6dd700819f2E606759",
  vdot:            "0x086Bd622eB3880f0eCCb8B86E0eB97f69b8dbD63",
  hollar:          "0xe5a9ea3dDEFfD3fC4C98b6B338abC0930f34C727",
  collateralVault: "0xff58177D585b5dB022B0773405a40bEC443E512a",
  lendingPool:     "0xA8b36339C55c664BBe7C59d2d59Abf91f472C8d0",
};

const EXPLORER = "https://blockscout-testnet.polkadot.io";

function link(tx) {
  return `${EXPLORER}/tx/${tx.hash}`;
}

async function waitAndLog(label, txPromise) {
  const tx = await txPromise;
  const receipt = await tx.wait();
  const status = receipt.status === 1 ? "✓" : "✗";
  console.log(`  ${status} ${label}`);
  console.log(`    ${link(tx)}`);
  return receipt;
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("=".repeat(60));
  console.log("DotLend Interact — Polkadot Hub TestNet");
  console.log(`Account: ${deployer.address}`);
  console.log("=".repeat(60));

  const vdot  = await hre.ethers.getContractAt("MockvDOT",         ADDRESSES.vdot);
  const hollar = await hre.ethers.getContractAt("MockHOLLAR",      ADDRESSES.hollar);
  const vault  = await hre.ethers.getContractAt("CollateralVault",  ADDRESSES.collateralVault);
  const pool   = await hre.ethers.getContractAt("LendingPool",      ADDRESSES.lendingPool);
  const oracle = await hre.ethers.getContractAt("PriceOracle",      ADDRESSES.priceOracle);

  const VDOT_DEPOSIT  = hre.ethers.parseEther("5");    // 5 vDOT = $42.50 @ $8.50
  const HOLLAR_BORROW = hre.ethers.parseEther("25");   // $25 HOLLAR (< 70% of $42.50)

  // ── Step 1: Check price ────────────────────────────────────────────────────
  console.log("\n[1] Checking oracle price...");
  const price = await oracle.getPrice(ADDRESSES.vdot);
  console.log(`  vDOT price: $${hre.ethers.formatEther(price)}`);

  // ── Step 2: Mint vDOT ──────────────────────────────────────────────────────
  console.log("\n[2] Minting 5 vDOT to deployer...");
  await waitAndLog("MockvDOT.mint(deployer, 5 vDOT)", vdot.mint(deployer.address, VDOT_DEPOSIT));

  const vdotBal = await vdot.balanceOf(deployer.address);
  console.log(`  vDOT balance: ${hre.ethers.formatEther(vdotBal)}`);

  // ── Step 3: Approve + Deposit ──────────────────────────────────────────────
  console.log("\n[3] Approving + depositing 5 vDOT into CollateralVault...");
  await waitAndLog("MockvDOT.approve(vault, 5 vDOT)", vdot.approve(ADDRESSES.collateralVault, VDOT_DEPOSIT));
  await waitAndLog("CollateralVault.deposit(5 vDOT)", vault.deposit(VDOT_DEPOSIT));

  const collateral = await vault.collateralBalance(deployer.address);
  const collateralUSD = await vault.getCollateralValue(deployer.address);
  console.log(`  Collateral: ${hre.ethers.formatEther(collateral)} vDOT = $${hre.ethers.formatEther(collateralUSD)}`);
  console.log(`  Health factor: ${hre.ethers.formatEther(await vault.getHealthFactor(deployer.address))} (no debt → max)`);

  // ── Step 4: Borrow ─────────────────────────────────────────────────────────
  console.log(`\n[4] Borrowing $${hre.ethers.formatEther(HOLLAR_BORROW)} HOLLAR...`);
  await waitAndLog("LendingPool.borrow(25 HOLLAR)", pool.borrow(HOLLAR_BORROW));

  const debt = await vault.debtBalance(deployer.address);
  const hf   = await vault.getHealthFactor(deployer.address);
  const hollarBal = await hollar.balanceOf(deployer.address);
  console.log(`  Debt: $${hre.ethers.formatEther(debt)} HOLLAR`);
  console.log(`  HOLLAR balance: ${hre.ethers.formatEther(hollarBal)}`);
  console.log(`  Health factor: ${hre.ethers.formatEther(hf)} (>1.0 = healthy)`);

  // ── Step 5: Repay ──────────────────────────────────────────────────────────
  console.log("\n[5] Repaying debt (mint buffer + approve + repay)...");
  // Mint 1 extra HOLLAR so deployer has enough to cover principal + accrued interest
  await waitAndLog("MockHOLLAR.mint(deployer, 1 HOLLAR buffer)", hollar.mint(deployer.address, hre.ethers.parseEther("1")));
  const repayAmount = hre.ethers.parseEther("26");
  await waitAndLog("MockHOLLAR.approve(pool, 26 HOLLAR)", hollar.approve(ADDRESSES.lendingPool, repayAmount));
  await waitAndLog("LendingPool.repay(26 HOLLAR)", pool.repay(repayAmount));

  const debtAfter = await vault.debtBalance(deployer.address);
  console.log(`  Debt after repay: $${hre.ethers.formatEther(debtAfter)} HOLLAR`);

  // ── Step 6: Withdraw ───────────────────────────────────────────────────────
  console.log("\n[6] Withdrawing 5 vDOT from CollateralVault...");
  await waitAndLog("CollateralVault.withdraw(5 vDOT)", vault.withdraw(VDOT_DEPOSIT));

  const collateralAfter = await vault.collateralBalance(deployer.address);
  console.log(`  Collateral remaining: ${hre.ethers.formatEther(collateralAfter)} vDOT`);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("INTERACT COMPLETE");
  console.log("=".repeat(60));
  console.log(`Explorer: ${EXPLORER}/address/${deployer.address}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
