// scripts/compile.js - Compile AgentArena.sol using solc
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const solc = require("solc");

const contractPath = path.resolve(__dirname, "../contracts/AgentArena.sol");
const source = readFileSync(contractPath, "utf8");

const input = {
  language: "Solidity",
  sources: {
    "AgentArena.sol": { content: source }
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    outputSelection: {
      "*": { "*": ["abi", "evm.bytecode"] }
    }
  }
};

console.log("Compiling AgentArena.sol...");
const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  const errors = output.errors.filter(e => e.severity === "error");
  if (errors.length > 0) {
    console.error("Compilation errors:");
    errors.forEach(e => console.error(e.formattedMessage));
    process.exit(1);
  }
  output.errors.forEach(e => console.warn(e.formattedMessage));
}

const contract = output.contracts["AgentArena.sol"]["AgentArena"];
const artifact = {
  abi: contract.abi,
  bytecode: contract.evm.bytecode.object
};

mkdirSync(path.resolve(__dirname, "../artifacts"), { recursive: true });
const outPath = path.resolve(__dirname, "../artifacts/AgentArena.json");
writeFileSync(outPath, JSON.stringify(artifact, null, 2));
console.log(`✅ Compiled! Artifact saved to artifacts/AgentArena.json`);
console.log(`   ABI entries: ${artifact.abi.length}`);
console.log(`   Bytecode size: ${artifact.bytecode.length / 2} bytes`);
