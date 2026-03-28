// scripts/deploy.js - Deploy AgentArena to X-Layer
import { ethers } from "ethers";
import { readFileSync, writeFileSync } from "fs";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
require("dotenv").config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const PRIVATE_KEY   = process.env.PRIVATE_KEY;
  // 直接使用 XLAYER_RPC，不再判断 testnet/mainnet
  const RPC_URL       = process.env.XLAYER_RPC || "https://rpc.xlayer.tech";
  const JUDGE_ADDRESS = process.env.JUDGE_ADDRESS;

  if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY not set in .env");
  if (!JUDGE_ADDRESS) throw new Error("JUDGE_ADDRESS not set in .env");

  console.log(`🔗 Connecting to: ${RPC_URL}`);
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);

  const network = await provider.getNetwork();
  const chainId = network.chainId;
  const isMainnet = chainId === 196n;
  
  console.log(`📡 Network: chainId=${chainId} (${isMainnet ? "Mainnet" : "Testnet"})`);
  console.log(`👛 Deployer: ${wallet.address}`);

  const balance = await provider.getBalance(wallet.address);
  console.log(`💰 Balance: ${ethers.formatEther(balance)} OKB`);

  if (balance === 0n) throw new Error("Deployer has no OKB. Fund your wallet first.");

  // Load artifact
  const artifact = JSON.parse(
    readFileSync(path.resolve(__dirname, "../artifacts/contracts/AgentArena.sol/AgentArena.json"), "utf8")
  );

  console.log("\n🚀 Deploying AgentArena...");
  const factory  = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy(JUDGE_ADDRESS);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`\n✅ AgentArena deployed at: ${address}`);
  
  const explorerUrl = isMainnet
    ? `https://www.okx.com/web3/explorer/xlayer/address/${address}`
    : `https://www.okx.com/web3/explorer/xlayer-test/address/${address}`;
  console.log(`🔍 Explorer: ${explorerUrl}`);

  // Save deployment info
  const deployment = {
    address,
    deployer: wallet.address,
    judgeAddress: JUDGE_ADDRESS,
    network: chainId.toString(),
    networkName: isMainnet ? "xlayer_mainnet" : "xlayer_testnet",
    deployedAt: new Date().toISOString()
  };

  writeFileSync(
    path.resolve(__dirname, "../artifacts/deployment.json"),
    JSON.stringify(deployment, null, 2)
  );
  
  console.log("\n📄 Deployment info saved to artifacts/deployment.json");
  console.log("\n📝 下一步:");
  console.log(`   1. 更新 .env: CONTRACT_ADDRESS=${address}`);
  console.log(`   2. 更新 frontend/.env.local: NEXT_PUBLIC_CONTRACT_ADDRESS=${address}`);

  return address;
}

main().catch(err => {
  console.error("Deploy failed:", err.message);
  process.exit(1);
});
