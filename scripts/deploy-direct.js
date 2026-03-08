const { ethers } = require("ethers");
const fs = require("fs");
require("dotenv").config();

async function main() {
  const artifact = JSON.parse(
    fs.readFileSync("./artifacts/contracts/Counter.sol/Counter.json", "utf8")
  );

  const provider = new ethers.JsonRpcProvider(
    "https://westend-asset-hub-eth-rpc.polkadot.io"
  );
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const balance = await provider.getBalance(wallet.address);
  console.log("Deployer:", wallet.address);
  console.log("Balance (raw wei):", balance.toString());

  const factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    wallet
  );

  console.log("Sending deploy tx...");
  const contract = await factory.deploy({
    gasLimit: 5_000_000,
  });

  console.log("Deploy tx hash:", contract.deploymentTransaction().hash);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("Counter deployed to:", address);
  console.log(
    "Subscan:",
    `https://assethub-westend.subscan.io/account/${address}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
