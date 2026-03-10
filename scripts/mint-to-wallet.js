const { ethers } = require("hardhat");

const RECIPIENT = "0x30e3f8b3Be42182984E89797e470120e8976E70C";
const VDOT_ADDR  = "0xa21443dfC33d44a4BaE8aA6fA6cA2A2d90F7F22F";
const USDH_ADDR = "0xA94f7464F3a2cA966CB31881A1614A9CF97859ca";
const AMOUNT = ethers.parseEther("1000");

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);

  const vdot = await ethers.getContractAt("MockvDOT", VDOT_ADDR, signer);
  const usdh = await ethers.getContractAt("MockUSDH", USDH_ADDR, signer);

  console.log("Minting 1000 MockvDOT...");
  const tx1 = await vdot.mint(RECIPIENT, AMOUNT);
  await tx1.wait();
  console.log("vDOT tx:", tx1.hash);

  console.log("Minting 1000 MockUSDH...");
  const tx2 = await usdh.mint(RECIPIENT, AMOUNT);
  await tx2.wait();
  console.log("USDH tx:", tx2.hash);

  console.log("Done. 1000 vDOT + 1000 USDH minted to", RECIPIENT);
}

main().catch((e) => { console.error(e); process.exit(1); });
