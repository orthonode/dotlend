/**
 * set-price.js — one-shot price submit to PriceOracle
 * Usage: npx hardhat run scripts/set-price.js --network polkadotHubTestnet
 * Override price: VDOT_PRICE=2.45 npx hardhat run ...
 */
const { ethers } = require("hardhat");

const PRICE_ORACLE = "0xc12D24cD6DF4521C9A453a325751bB1f38326a91";
const VDOT_ADDR    = "0xa21443dfC33d44a4BaE8aA6fA6cA2A2d90F7F22F";
const PRICE_USD    = process.env.VDOT_PRICE || "2.45";

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Signer:      ", signer.address);
  console.log("PriceOracle: ", PRICE_ORACLE);
  console.log("vDOT addr:   ", VDOT_ADDR);
  console.log("Price:       $" + PRICE_USD);

  const oracle = await ethers.getContractAt("PriceOracle", PRICE_ORACLE, signer);

  // Confirm signer is authorized oracle
  const auth = await oracle.authorizedOracle();
  if (auth.toLowerCase() !== signer.address.toLowerCase()) {
    console.error(`ERROR: signer ${signer.address} is not authorized oracle (${auth})`);
    process.exit(1);
  }

  const priceWei = ethers.parseEther(PRICE_USD);
  const tx = await oracle.submitPrice(VDOT_ADDR, priceWei);
  console.log("Tx hash:", tx.hash);
  await tx.wait();
  console.log("Price submitted successfully.");

  // Verify
  const stored = await oracle.getPrice(VDOT_ADDR);
  console.log("Verified on-chain:", ethers.formatEther(stored), "USD");
  console.log("Explorer: https://blockscout-testnet.polkadot.io/tx/" + tx.hash);
}

main().catch(e => { console.error(e); process.exit(1); });
