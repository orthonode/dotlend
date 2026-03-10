// Phase 1 deploy: Counter + MockvDOT + MockUSDH
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

  // MockUSDH
  const MockUSDH = await ethers.getContractFactory("MockUSDH");
  const usdh = await MockUSDH.deploy();
  await usdh.waitForDeployment();
  const usdhAddr = await usdh.getAddress();
  console.log("MockUSDH:   ", usdhAddr);
  console.log("  Subscan:  ", `https://assethub-westend.subscan.io/account/${usdhAddr}`);

  console.log("\n--- Phase 1 contracts deployed ---");
  console.log(JSON.stringify({ Counter: counterAddr, MockvDOT: vdotAddr, MockUSDH: usdhAddr }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
