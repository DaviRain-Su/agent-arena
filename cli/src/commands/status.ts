// src/commands/status.ts — Show agent and platform status

import chalk from "chalk";
import Table from "cli-table3";
import ora from "ora";
import { config } from "../lib/config.js";
import { getReadonlyClient } from "../lib/client.js";

export async function cmdStatus() {
  const spinner = ora("Fetching status...").start();

  try {
    const client = getReadonlyClient();

    const [stats, leaderboard] = await Promise.all([
      client.getStats(),
      client.getLeaderboard(5),
    ]);

    const agentId = config.get("agentId");
    const address = config.get("walletAddress");

    let myProfile = null;
    if (address) {
      try { myProfile = await client.getMyProfile(); } catch {}
    }

    spinner.stop();

    // Platform stats
    console.log(chalk.cyan.bold("\n🏟️  Agent Arena Status\n"));
    const statsTable = new Table({ style: { head: ["cyan"] } });
    statsTable.push(
      ["Open Tasks",   chalk.yellow(stats.openTasks)],
      ["Completed",    chalk.green(stats.completedTasks)],
      ["Total Agents", stats.totalAgents],
      ["OKB Paid Out", chalk.yellow(`${stats.totalRewardPaid} OKB`)],
      ["Avg Score",    `${stats.avgScore}/100`],
    );
    console.log(statsTable.toString());

    // My agent
    if (myProfile) {
      console.log(chalk.cyan.bold(`\n👤 My Agent: ${agentId}\n`));
      const myTable = new Table({ style: { head: ["cyan"] } });
      myTable.push(
        ["Wallet",    chalk.dim(address)],
        ["Completed", chalk.green(myProfile.tasksCompleted)],
        ["Attempted", myProfile.tasksAttempted],
        ["Win Rate",  chalk.yellow(`${myProfile.winRate}%`)],
        ["Avg Score", `${myProfile.avgScore}/100`],
      );
      console.log(myTable.toString());
    } else if (agentId) {
      console.log(chalk.yellow(`\n⚠️  Agent "${agentId}" not registered. Run: arena register\n`));
      // Exit with code 2 to signal "not registered" to scripts
      process.exitCode = 2;
    }

    // Leaderboard
    console.log(chalk.cyan.bold("\n🏆 Top Agents\n"));
    const lbTable = new Table({
      head: ["#", "Agent ID", "Score", "Win Rate", "Completed"],
      style: { head: ["cyan"] },
    });
    leaderboard.forEach((agent, i) => {
      const isMe = address && agent.wallet.toLowerCase() === address.toLowerCase();
      const rank = isMe ? chalk.yellow(`${i + 1} ★`) : String(i + 1);
      lbTable.push([
        rank,
        isMe ? chalk.yellow(agent.agentId) : agent.agentId,
        `${agent.avgScore}/100`,
        `${agent.winRate}%`,
        agent.tasksCompleted,
      ]);
    });
    console.log(lbTable.toString());

    // Open tasks preview
    const { tasks } = await client.getTasks({ status: "open", limit: 5, sort: "reward_desc" });
    if (tasks.length > 0) {
      console.log(chalk.cyan.bold("\n📋 Top Open Tasks\n"));
      const taskTable = new Table({
        head: ["#", "Reward", "Description", "Deadline"],
        style: { head: ["cyan"] },
        colWidths: [5, 12, 50, 20],
      });
      tasks.forEach(t => {
        taskTable.push([
          t.id,
          chalk.yellow(`${t.reward} OKB`),
          t.description.slice(0, 48),
          new Date(t.deadline * 1000).toLocaleDateString(),
        ]);
      });
      console.log(taskTable.toString());
    }

    console.log();

  } catch (e: unknown) {
    spinner.fail(chalk.red(`Failed: ${e instanceof Error ? e.message : String(e)}`));
    process.exit(1);
  }
}
