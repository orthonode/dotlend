// scripts/deploy-protocol.js
// Deploys full DotLend protocol stack:
//   PriceOracle → MockvDOT → MockHOLLAR → CollateralVault → LendingPool
// Then wires: vault.setLendingPool, oracle.setAuthorizedOracle (deployer as oracle for now)
// Prints explorer links for all deployed contracts.

const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  console.log("=".repeat(60));
  console.log("DotLend Protocol Deploy");
  console.log(`Network:  ${network}`);
  console.log(`Deployer: ${deployer.address}`);
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
  console.log("\n[1/5] Deploying PriceOracle...");
  const PriceOracle = await hre.ethers.getContractFactory("PriceOracle");
  const oracle = await PriceOracle.deploy();
  await oracle.waitForDeployment();
  console.log(`  PriceOracle:      ${oracle.target}`);

  // 2. MockvDOT
  console.log("[2/5] Deploying MockvDOT...");
  const MockvDOT = await hre.ethers.getContractFactory("MockvDOT");
  const vdot = await MockvDOT.deploy();
  await vdot.waitForDeployment();
  console.log(`  MockvDOT:         ${vdot.target}`);

  // 3. MockHOLLAR
  console.log("[3/5] Deploying MockHOLLAR...");
  const MockHOLLAR = await hre.ethers.getContractFactory("MockHOLLAR");
  const hollar = await MockHOLLAR.deploy();
  await hollar.waitForDeployment();
  console.log(`  MockHOLLAR:       ${hollar.target}`);

  // 4. CollateralVault
  console.log("[4/5] Deploying CollateralVault...");
  const CollateralVault = await hre.ethers.getContractFactory("CollateralVault");
  const vault = await CollateralVault.deploy(vdot.target, oracle.target);
  await vault.waitForDeployment();
  console.log(`  CollateralVault:  ${vault.target}`);

  // 5. LendingPool
  console.log("[5/5] Deploying LendingPool...");
  const LendingPool = await hre.ethers.getContractFactory("LendingPool");
  const pool = await LendingPool.deploy(vault.target, hollar.target, oracle.target, vdot.target);
  await pool.waitForDeployment();
  console.log(`  LendingPool:      ${pool.target}`);

  // Wire: vault → pool
  console.log("\n[Wire] vault.setLendingPool(pool)...");
  const tx1 = await vault.setLendingPool(pool.target);
  await tx1.wait();
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

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOY COMPLETE");
  console.log("=".repeat(60));
  console.log(`PriceOracle:     ${oracle.target}`);
  console.log(`MockvDOT:        ${vdot.target}`);
  console.log(`MockHOLLAR:      ${hollar.target}`);
  console.log(`CollateralVault: ${vault.target}`);
  console.log(`LendingPool:     ${pool.target}`);

  if (isPolkadotHub || isPaseo || isWestend) {
    console.log("\nExplorer links:");
    console.log(`  PriceOracle:     ${explorerBase}/${oracle.target}`);
    console.log(`  MockvDOT:        ${explorerBase}/${vdot.target}`);
    console.log(`  MockHOLLAR:      ${explorerBase}/${hollar.target}`);
    console.log(`  CollateralVault: ${explorerBase}/${vault.target}`);
    console.log(`  LendingPool:     ${explorerBase}/${pool.target}`);
  }

  console.log("\nNext: update PHASES.md with deployed addresses.");
  console.log("Next: run oracle/oracle.py with LendingPool address.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
