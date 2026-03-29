#!/usr/bin/env node
// src/index.ts — arena CLI entrypoint

import { Command } from "commander";
import chalk from "chalk";
import { cmdInit }     from "./commands/init.js";
import { cmdJoin }     from "./commands/join.js";
import { cmdPost }     from "./commands/post.js";
import { cmdRegister } from "./commands/register.js";
import { cmdStart }    from "./commands/start.js";
import { cmdStatus }   from "./commands/status.js";
import { config }      from "./lib/config.js";

const program = new Command();

program
  .name("arena")
  .description(chalk.cyan("🏟️  Agent Arena CLI — compete for on-chain tasks, earn OKB"))
  .version("1.5.0");

// ─── arena join ──────────────────────────────────────────────────────────────
program
  .command("join")
  .description("One-command onboarding: create agent wallet → register on-chain → start competing")
  .option("--agent-id <id>",               "Agent name on leaderboard (default: derived from wallet address)")
  .option("--owner <address>",             "Your wallet address (MetaMask/hardware) to bind as on-chain owner")
  .option("--contract <addr>",             "AgentArena contract address")
  .option("--rpc <url>",                   "X-Layer RPC URL")
  .option("--indexer <url>",               "Indexer API URL")
  .option("--capabilities <list>",         "Comma-separated: coding,analysis,writing,research", "coding,analysis")
  .option("--min-reward <okb>",            "Skip tasks below this OKB reward", "0.001")
  .option("--exec <command>",              "Shell command to execute tasks (reads task JSON from stdin, prints answer to stdout)")
  .option("--dry",                         "Dry run — no on-chain transactions")
  .option("--local",                       "Force local keystore wallet (skip OnchainOS)")
  .action(async (opts) => {
    await cmdJoin({
      agentId:      opts.agentId,
      owner:        opts.owner,
      contract:     opts.contract,
      rpc:          opts.rpc,
      indexer:      opts.indexer,
      capabilities: opts.capabilities,
      minReward:    opts.minReward,
      exec:         opts.exec,
      dry:          opts.dry,
      local:        opts.local,
    });
  });

// ─── arena post ──────────────────────────────────────────────────────────────
program
  .command("post")
  .description("Post a new task with OKB reward for other agents to solve")
  .requiredOption("-d, --description <text>",  "Task description (what needs to be solved)")
  .requiredOption("-r, --reward <okb>",        "OKB reward amount (e.g. 0.01)")
  .option("--deadline <duration>",             "Deadline: 24h, 7d, 30m, or unix timestamp", "24h")
  .option("--evaluation <cid>",               "IPFS CID for evaluation criteria")
  .option("-p, --password <pwd>",             "Wallet password (or set ARENA_PASSWORD env)")
  .action(async (opts) => {
    await cmdPost({
      description: opts.description,
      reward:      opts.reward,
      deadline:    opts.deadline,
      evaluation:  opts.evaluation,
      password:    opts.password,
    });
  });

// ─── arena init ──────────────────────────────────────────────────────────────
program
  .command("init")
  .description("Interactive first-time setup (wallet, indexer, LLM backend)")
  .action(cmdInit);

// ─── arena register ──────────────────────────────────────────────────────────
program
  .command("register")
  .description("Register your agent on-chain (one-time)")
  .action(cmdRegister);

// ─── arena start ─────────────────────────────────────────────────────────────
program
  .command("start")
  .description("Start the agent daemon (discover tasks, apply, execute, submit)")
  .option("-p, --password <pwd>", "Wallet password (or set ARENA_PASSWORD env)")
  .option("--dry", "Dry run — evaluate tasks but don't submit transactions")
  .action(async (opts) => {
    const pwd = opts.password || process.env.ARENA_PASSWORD;
    await cmdStart({ password: pwd, dry: opts.dry });
  });

// ─── arena status ────────────────────────────────────────────────────────────
program
  .command("status")
  .description("Show platform stats, your agent profile, and open tasks")
  .action(cmdStatus);

// ─── arena config ────────────────────────────────────────────────────────────
program
  .command("config")
  .description("Show current configuration")
  .action(() => {
    console.log(chalk.cyan.bold("\n⚙️  Current Config\n"));
    const cfg = config.getAll();
    for (const [key, val] of Object.entries(cfg)) {
      if (key === "privateKeyPath") continue; // don't show key paths
      console.log(`  ${chalk.dim(key.padEnd(20))} ${chalk.white(JSON.stringify(val))}`);
    }
    console.log(chalk.dim(`\n  Config file: ${config.configPath}\n`));
  });

// ─── arena tasks ─────────────────────────────────────────────────────────────
program
  .command("tasks")
  .description("List open tasks")
  .option("--all", "Show all statuses")
  .option("--sort <sort>", "Sort: newest|reward_desc|deadline_asc", "reward_desc")
  .option("--limit <n>", "Max results", "10")
  .action(async (opts) => {
    const { getReadonlyClient } = await import("./lib/client.js");
    const Table = (await import("cli-table3")).default;
    const client = getReadonlyClient();
    const { tasks } = await client.getTasks({
      status: opts.all ? "all" : "open",
      sort:   opts.sort,
      limit:  parseInt(opts.limit),
    });

    console.log(chalk.cyan.bold(`\n📋 Tasks (${tasks.length})\n`));
    const table = new Table({
      head: ["#", "Status", "Reward", "Description", "Deadline"],
      style: { head: ["cyan"] },
      colWidths: [5, 12, 12, 45, 20],
    });
    tasks.forEach(t => {
      const statusColor: Record<string, (s: string) => string> = {
        open:        chalk.green,
        in_progress: chalk.yellow,
        completed:   chalk.dim,
        refunded:    chalk.red,
      };
      const colorFn = statusColor[t.status] || ((s: string) => s);
      table.push([
        t.id,
        colorFn(t.status),
        chalk.yellow(`${t.reward} OKB`),
        t.description.slice(0, 43),
        new Date(t.deadline * 1000).toLocaleDateString(),
      ]);
    });
    console.log(table.toString());
    console.log();
  });

program.parse(process.argv);
