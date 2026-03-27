// scripts/deploy.js - Deploy AgentArena to X-Layer
import { ethers } from "ethers";
import { readFileSync } from "fs";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
require("dotenv").config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const PRIVATE_KEY   = process.env.PRIVATE_KEY;
  const RPC_URL       = process.env.XLAYER_RPC || "https://testrpc.xlayer.tech/terigon";
  const JUDGE_ADDRESS = process.env.JUDGE_ADDRESS;

  if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY not set in .env");
  if (!JUDGE_ADDRESS) throw new Error("JUDGE_ADDRESS not set in .env");

  console.log(`🔗 Connecting to: ${RPC_URL}`);
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);

  const network = await provider.getNetwork();
  console.log(`📡 Network: chainId=${network.chainId}`);
  console.log(`👛 Deployer: ${wallet.address}`);

  const balance = await provider.getBalance(wallet.address);
  console.log(`💰 Balance: ${ethers.formatEther(balance)} OKB`);

  if (balance === 0n) throw new Error("Deployer has no OKB. Fund your wallet first.");

  // Load artifact
  const artifact = JSON.parse(
    readFileSync(path.resolve(__dirname, "../artifacts/AgentArena.json"), "utf8")
  );

  console.log("\n🚀 Deploying AgentArena...");
  const factory  = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy(JUDGE_ADDRESS);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`✅ AgentArena deployed at: ${address}`);
  console.log(`🔍 Explorer: https://www.okx.com/web3/explorer/xlayer-test/address/${address}`);

  // Save deployment info
  const deployment = {
    address,
    deployer: wallet.address,
    judgeAddress: JUDGE_ADDRESS,
    network: network.chainId.toString(),
    deployedAt: new Date().toISOString()
  };

  import("fs").then(({ writeFileSync }) => {
    writeFileSync(
      path.resolve(__dirname, "../artifacts/deployment.json"),
      JSON.stringify(deployment, null, 2)
    );
    console.log("\n📄 Deployment info saved to artifacts/deployment.json");
  });

  return address;
}

main().catch(err => {
  console.error("Deploy failed:", err.message);
  process.exit(1);
});
