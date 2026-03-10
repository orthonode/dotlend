// scripts/deploy-protocol.js
// Deploys full DotLend protocol stack:
//   PriceOracle → MockvDOT → MockUSDH → TreasuryRouter → CollateralVault → LendingPool
// Then wires: vault.setLendingPool, router.setLendingPool, oracle.setAuthorizedOracle
// Revenue model: 100% of stability fees → treasury (MakerDAO-style, no USDH burn)

const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  const treasuryAddr = process.env.TREASURY_ADDRESS || deployer.address;

  console.log("=".repeat(60));
  console.log("DotLend Protocol Deploy");
  console.log(`Network:   ${network}`);
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`Treasury:  ${treasuryAddr}`);
  console.log("=".repeat(60));

  const isPolkadotHub = network === "polkadotHubTestnet";
  const isPaseo = network === "paseoAssetHub";
  const isWestend = network === "westendAssetHub";
  const explorerBase = isPolkadotHub
    ? "https://blockscout-testnet.polkadot.io/address"
    : isPaseo
    ? "https://blockscout-passet-hub.parity-testnet.parity.io/address"
    : "https://assethub-westend.subscan.io/account";

  // 1. PriceOracle
  console.log("\n[1/7] Deploying PriceOracle...");
  const PriceOracle = await hre.ethers.getContractFactory("PriceOracle");
  const oracle = await PriceOracle.deploy();
  await oracle.waitForDeployment();
  console.log(`  PriceOracle:      ${oracle.target}`);

  // 2. MockvDOT
  console.log("[2/7] Deploying MockvDOT...");
  const MockvDOT = await hre.ethers.getContractFactory("MockvDOT");
  const vdot = await MockvDOT.deploy();
  await vdot.waitForDeployment();
  console.log(`  MockvDOT:         ${vdot.target}`);

  // 3. MockUSDH
  console.log("[3/7] Deploying MockUSDH...");
  const MockUSDH = await hre.ethers.getContractFactory("MockUSDH");
  const usdh = await MockUSDH.deploy();
  await usdh.waitForDeployment();
  console.log(`  MockUSDH:         ${usdh.target}`);

  // 4. TreasuryRouter — 100% of fees to treasury, no USDH burn
  console.log("[4/7] Deploying TreasuryRouter...");
  const TreasuryRouter = await hre.ethers.getContractFactory("TreasuryRouter");
  const router = await TreasuryRouter.deploy(usdh.target, treasuryAddr);
  await router.waitForDeployment();
  console.log(`  TreasuryRouter:   ${router.target}`);

  // 5. CollateralVault
  console.log("[5/7] Deploying CollateralVault...");
  const CollateralVault = await hre.ethers.getContractFactory("CollateralVault");
  const vault = await CollateralVault.deploy(vdot.target, oracle.target);
  await vault.waitForDeployment();
  console.log(`  CollateralVault:  ${vault.target}`);

  // 6. LendingPool — uses TreasuryRouter, not raw MockUSDH
  console.log("[6/7] Deploying LendingPool...");
  const LendingPool = await hre.ethers.getContractFactory("LendingPool");
  const pool = await LendingPool.deploy(vault.target, router.target, oracle.target, vdot.target);
  await pool.waitForDeployment();
  console.log(`  LendingPool:      ${pool.target}`);

  // Wire: vault → pool
  console.log("\n[Wire] vault.setLendingPool(pool)...");
  const tx1 = await vault.setLendingPool(pool.target);
  await tx1.wait();
  console.log("  Done.");

  // Wire: router → pool
  console.log("[Wire] router.setLendingPool(pool)...");
  const tx1b = await router.setLendingPool(pool.target);
  await tx1b.wait();
  console.log("  Done.");

  // Wire: oracle → deployer as authorized price poster (replace with oracle.py address later)
  console.log("[Wire] oracle.setAuthorizedOracle(deployer)...");
  const tx2 = await oracle.setAuthorizedOracle(deployer.address);
  await tx2.wait();
  console.log("  Done.");

  // Seed initial vDOT price ($8.50)
  console.log("[Seed] Submitting initial vDOT price ($8.50)...");
  const initialPrice = hre.ethers.parseEther("8.5");
  const tx3 = await oracle.submitPrice(vdot.target, initialPrice);
  await tx3.wait();
  console.log("  vDOT price set to $8.50");

  // 7. Deploy SolvencyGateway + MockSolvencyVerifier
  console.log("\n[7/7] Deploying MockSolvencyVerifier...");
  const MockVerifier = await hre.ethers.getContractFactory("MockSolvencyVerifier");
  const verifier = await MockVerifier.deploy(true);
  await verifier.waitForDeployment();
  console.log(`  MockSolvencyVerifier: ${verifier.target}`);

  console.log("[ZK] Deploying SolvencyGateway...");
  const SolvencyGateway = await hre.ethers.getContractFactory("SolvencyGateway");
  const gateway = await SolvencyGateway.deploy();
  await gateway.waitForDeployment();
  console.log(`  SolvencyGateway: ${gateway.target}`);

  console.log("[ZK] Wiring verifier to gateway...");
  const tx4 = await gateway.setSolvencyVerifier(verifier.target);
  await tx4.wait();
  console.log("  Done.");

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOY COMPLETE");
  console.log("=".repeat(60));
  console.log(`PriceOracle:          ${oracle.target}`);
  console.log(`MockvDOT:             ${vdot.target}`);
  console.log(`MockUSDH:             ${usdh.target}`);
  console.log(`TreasuryRouter:       ${router.target}`);
  console.log(`CollateralVault:      ${vault.target}`);
  console.log(`LendingPool:          ${pool.target}`);
  console.log(`MockSolvencyVerifier: ${verifier.target}`);
  console.log(`SolvencyGateway:      ${gateway.target}`);

  if (isPolkadotHub || isPaseo || isWestend) {
    console.log("\nExplorer links:");
    console.log(`  PriceOracle:          ${explorerBase}/${oracle.target}`);
    console.log(`  MockvDOT:             ${explorerBase}/${vdot.target}`);
    console.log(`  MockUSDH:             ${explorerBase}/${usdh.target}`);
    console.log(`  TreasuryRouter:       ${explorerBase}/${router.target}`);
    console.log(`  CollateralVault:      ${explorerBase}/${vault.target}`);
    console.log(`  LendingPool:          ${explorerBase}/${pool.target}`);
    console.log(`  MockSolvencyVerifier: ${explorerBase}/${verifier.target}`);
    console.log(`  SolvencyGateway:      ${explorerBase}/${gateway.target}`);
  }

  console.log("\nNext: update frontend/src/lib/contracts.ts with deployed addresses.");
  console.log("Next: run oracle/oracle.py with LendingPool address.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

