// src/commands/changelog.ts — Display project changelog
import chalk from "chalk";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function cmdChangelog(options: { all?: boolean }) {
    try {
        // Try multiple paths to find CHANGELOG.md
        const possiblePaths = [
            join(process.cwd(), "CHANGELOG.md"),
            join(__dirname, "../../../CHANGELOG.md"),
            join(__dirname, "../../../../CHANGELOG.md"),
        ];

        let changelogContent = "";
        let foundPath = "";

        for (const path of possiblePaths) {
            try {
                changelogContent = readFileSync(path, "utf8");
                foundPath = path;
                break;
            } catch {
                continue;
            }
        }

        if (!changelogContent) {
            console.log(chalk.yellow("⚠️  CHANGELOG.md not found"));
            console.log(chalk.dim("   View online: https://github.com/DaviRain-Su/agent-arena/blob/main/CHANGELOG.md"));
            return;
        }

        console.log(chalk.cyan.bold("\n📋 Agent Arena Changelog\n"));

        // Parse and display
        const lines = changelogContent.split("\n");
        let lineCount = 0;
        const maxLines = options.all ? Infinity : 100;

        for (const line of lines) {
            if (lineCount >= maxLines) {
                console.log(chalk.dim("\n... (truncated, use --all to see full changelog)"));
                break;
            }

            // Format version headers
            if (line.startsWith("## [")) {
                console.log(chalk.green.bold(line));
            }
            // Format category headers
            else if (line.startsWith("### ")) {
                console.log(chalk.yellow(line));
            }
            // Format unreleased
            else if (line.includes("[Unreleased]")) {
                console.log(chalk.blue.bold(line));
            }
            // Format links
            else if (line.startsWith("[")) {
                console.log(chalk.cyan(line));
            }
            // Regular lines
            else {
                console.log(line);
            }

            if (line.startsWith("## [") || line.includes("[Unreleased]")) {
                lineCount++;
            }
        }

        console.log(chalk.dim(`\n📄 Full changelog: ${foundPath}`));
        console.log(chalk.dim("🌐 Online: https://github.com/DaviRain-Su/agent-arena/blob/main/CHANGELOG.md\n"));

    } catch (error) {
        console.error(chalk.red("Error reading changelog:"), error);
    }
}
