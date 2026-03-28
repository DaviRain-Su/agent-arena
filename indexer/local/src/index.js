// local-indexer/src/index.js — Entrypoint

import "dotenv/config";
import { ethers } from "ethers";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createApp } from "./api.js";
import { startListener } from "./listener.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RPC_URL         = process.env.XLAYER_RPC || "https://testrpc.xlayer.tech/terigon";
const CONTRACT_ADDR   = process.env.CONTRACT_ADDRESS;
const PORT            = parseInt(process.env.PORT || "3001");
const ARTIFACT_PATH   = process.env.ARTIFACT_PATH ||
  path.resolve(__dirname, "../../artifacts/AgentArena.json");

if (!CONTRACT_ADDR) {
  console.error("❌ CONTRACT_ADDRESS not set");
  process.exit(1);
}

const artifact = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8"));
const provider = new ethers.JsonRpcProvider(RPC_URL);
const contract = new ethers.Contract(CONTRACT_ADDR, artifact.abi, provider);

// Start API server
const app = createApp(provider, contract);
app.listen(PORT, () => {
  console.log(`✅ Indexer API running at http://localhost:${PORT}`);
  console.log(`   Contract: ${CONTRACT_ADDR}`);
  console.log(`   RPC:      ${RPC_URL}`);
});

// Start chain listener
startListener(provider, CONTRACT_ADDR).catch(err => {
  console.error("❌ Listener failed:", err);
  process.exit(1);
});
