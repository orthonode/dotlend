// Phase 1 deploy: Counter + MockvDOT + MockHOLLAR
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Counter
  const Counter = await ethers.getContractFactory("Counter");
  const counter = await Counter.deploy();
  await counter.waitForDeployment();
  const counterAddr = await counter.getAddress();
  console.log("Counter:    ", counterAddr);
  console.log("  Subscan:  ", `https://assethub-westend.subscan.io/account/${counterAddr}`);

  // MockvDOT
  const MockvDOT = await ethers.getContractFactory("MockvDOT");
  const vdot = await MockvDOT.deploy();
  await vdot.waitForDeployment();
  const vdotAddr = await vdot.getAddress();
  console.log("MockvDOT:   ", vdotAddr);
  console.log("  Subscan:  ", `https://assethub-westend.subscan.io/account/${vdotAddr}`);

  // MockHOLLAR
  const MockHOLLAR = await ethers.getContractFactory("MockHOLLAR");
  const hollar = await MockHOLLAR.deploy();
  await hollar.waitForDeployment();
  const hollarAddr = await hollar.getAddress();
  console.log("MockHOLLAR: ", hollarAddr);
  console.log("  Subscan:  ", `https://assethub-westend.subscan.io/account/${hollarAddr}`);

  console.log("\n--- Phase 1 contracts deployed ---");
  console.log(JSON.stringify({ Counter: counterAddr, MockvDOT: vdotAddr, MockHOLLAR: hollarAddr }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
