// scripts/interact.js
// End-to-end DotLend flow on Polkadot Hub TestNet:
//   mint vDOT → deposit → borrow USDH → repay → withdraw
// Uses deployer account. Prints Blockscout links for every tx.

const hre = require("hardhat");

const ADDRESSES = {
  priceOracle:     "0xc12D24cD6DF4521C9A453a325751bB1f38326a91",
  vdot:            "0xa21443dfC33d44a4BaE8aA6fA6cA2A2d90F7F22F",
  usdh:            "0xA94f7464F3a2cA966CB31881A1614A9CF97859ca",
  collateralVault: "0x57c1d7f0a596FD53923d7AB6c6F2ed0ea73d51A8",
  lendingPool:     "0xda1eBb8A45ea027b6d2d80AcD6b299ceE31B0419",
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
  const usdh = await hre.ethers.getContractAt("MockUSDH",      ADDRESSES.usdh);
  const vault  = await hre.ethers.getContractAt("CollateralVault",  ADDRESSES.collateralVault);
  const pool   = await hre.ethers.getContractAt("LendingPool",      ADDRESSES.lendingPool);
  const oracle = await hre.ethers.getContractAt("PriceOracle",      ADDRESSES.priceOracle);

  const VDOT_DEPOSIT = hre.ethers.parseEther("5"); // 5 vDOT

  // ── Step 1: Check price ────────────────────────────────────────────────────
  console.log("\n[1] Checking oracle price...");
  const price = await oracle.getPrice(ADDRESSES.vdot);
  console.log(`  vDOT price: $${hre.ethers.formatEther(price)}`);

  // Collateral value in USDH-wei: 5 vDOT * price / 1e18
  // Borrow at 60% LTV (leaves 10% headroom under the 70% cap)
  const collateralValue = (VDOT_DEPOSIT * price) / hre.ethers.parseEther("1");
  const USDH_BORROW = (collateralValue * 60n) / 100n;
  console.log(`  Collateral value: $${hre.ethers.formatEther(collateralValue)}`);
  console.log(`  Borrow target (60% LTV): $${hre.ethers.formatEther(USDH_BORROW)}`);

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
  console.log(`\n[4] Borrowing $${hre.ethers.formatEther(USDH_BORROW)} USDH...`);
  await waitAndLog(`LendingPool.borrow(${hre.ethers.formatEther(USDH_BORROW)} USDH)`, pool.borrow(USDH_BORROW));

  const debt = await vault.debtBalance(deployer.address);
  const hf   = await vault.getHealthFactor(deployer.address);
  const usdhBal = await usdh.balanceOf(deployer.address);
  console.log(`  Debt: $${hre.ethers.formatEther(debt)} USDH`);
  console.log(`  USDH balance: ${hre.ethers.formatEther(usdhBal)}`);
  console.log(`  Health factor: ${hre.ethers.formatEther(hf)} (>1.0 = healthy)`);

  // ── Step 5: Repay ──────────────────────────────────────────────────────────
  console.log("\n[5] Repaying debt (mint buffer + approve + repay)...");
  // Mint 1 extra USDH so deployer has enough to cover principal + accrued interest
  // Buffer = 1% of borrow to cover any accrued interest
  const buffer = USDH_BORROW / 100n;
  await waitAndLog("MockUSDH.mint(deployer, interest buffer)", usdh.mint(deployer.address, buffer));
  const repayAmount = USDH_BORROW + buffer;
  await waitAndLog(`MockUSDH.approve(pool, ${hre.ethers.formatEther(repayAmount)} USDH)`, usdh.approve(ADDRESSES.lendingPool, repayAmount));
  await waitAndLog(`LendingPool.repay(${hre.ethers.formatEther(repayAmount)} USDH)`, pool.repay(repayAmount));

  const debtAfter = await vault.debtBalance(deployer.address);
  console.log(`  Debt after repay: $${hre.ethers.formatEther(debtAfter)} USDH`);

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
