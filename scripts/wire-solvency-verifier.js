// scripts/wire-solvency-verifier.js
// Deploys MockSolvencyVerifier to Polkadot Hub TestNet and wires it
// to the live LendingPool via setSolvencyVerifier().
// Run once: npx hardhat run scripts/wire-solvency-verifier.js --network polkadotHubTestnet

const hre = require("hardhat");

const LENDING_POOL = "0xA8b36339C55c664BBe7C59d2d59Abf91f472C8d0";
const EXPLORER = "https://blockscout-testnet.polkadot.io";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);

  // Deploy MockSolvencyVerifier (accepts all proofs)
  const MockVerifier = await hre.ethers.getContractFactory("MockSolvencyVerifier");
  const verifier = await MockVerifier.deploy(true);
  await verifier.waitForDeployment();
  console.log(`MockSolvencyVerifier: ${verifier.target}`);
  console.log(`  ${EXPLORER}/address/${verifier.target}`);

  // Wire to LendingPool
  const pool = await hre.ethers.getContractAt("LendingPool", LENDING_POOL);
  const tx = await pool.setSolvencyVerifier(verifier.target);
  await tx.wait();
  console.log(`setSolvencyVerifier tx: ${tx.hash}`);
  console.log(`  ${EXPLORER}/tx/${tx.hash}`);
  console.log("Done — LendingPool is wired to MockSolvencyVerifier.");
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error(err); process.exit(1); });
