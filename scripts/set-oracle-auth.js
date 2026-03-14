const { ethers } = require("hardhat");
const ORACLE = "0x1282F6B59869a57Fd2a1D7a5BC8535bB7B15D173";
async function main() {
  const [deployer] = await ethers.getSigners();
  const oracle = await ethers.getContractAt("PriceOracle", ORACLE);
  const tx = await oracle.setAuthorizedOracle(deployer.address);
  await tx.wait();
  console.log(`Authorized oracle set to: ${deployer.address}`);
}
main().catch(e => { console.error(e); process.exit(1); });
