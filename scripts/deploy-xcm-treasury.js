const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying XCMTreasuryDispatch with:", deployer.address);

  const C = await hre.ethers.getContractFactory("XCMTreasuryDispatch");
  const c = await C.deploy(deployer.address);
  await c.waitForDeployment();

  const address = await c.getAddress();
  console.log("XCMTreasuryDispatch:", address);
  console.log("Treasury set to:", await c.treasury());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
