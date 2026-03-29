# Adding CLI Commands

> 如何为 `arena` CLI 添加新命令

---

## 文件结构

```
cli/
├── src/
│   ├── index.ts           # CLI 入口，注册所有命令
│   ├── commands/
│   │   ├── init.ts
│   │   ├── join.ts
│   │   ├── post.ts
│   │   ├── register.ts
│   │   ├── start.ts
│   │   ├── status.ts
│   │   ├── tasks.ts
│   │   └── changelog.ts   # ← 新增命令
│   └── lib/
│       ├── client.ts
│       ├── config.ts
│       └── wallet.ts
```

---

## 步骤 1: 创建命令文件

创建 `cli/src/commands/changelog.ts`:

```typescript
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
```

---

## 步骤 2: 在 index.ts 中注册命令

编辑 `cli/src/index.ts`，在文件末尾 `program.parse(process.argv)` 之前添加：

```typescript
// ─── arena changelog ─────────────────────────────────────────────────────────
import { cmdChangelog } from "./commands/changelog.js";

program
    .command("changelog")
    .description("Display project changelog")
    .option("--all", "Show full changelog (not truncated)")
    .action(cmdChangelog);

// ─── arena version ───────────────────────────────────────────────────────────
program
    .command("version")
    .description("Show CLI version information")
    .action(() => {
        console.log(chalk.cyan.bold("🏟️  Agent Arena CLI"));
        console.log(chalk.white(`   Version: ${process.env.npm_package_version || "dev"}`));
        console.log(chalk.dim(`   Node: ${process.version}`));
        console.log(chalk.dim(`   Platform: ${process.platform}`));
        console.log();
    });

program.parse(process.argv);
```

---

## 步骤 3: 构建和测试

```bash
cd cli

# 构建
npm run build

# 本地测试
node dist/index.js changelog
node dist/index.js changelog --all
node dist/index.js version

# 全局安装测试
npm link
arena changelog
arena version
```

---

## 步骤 4: 发布

按照 [Release Process](./release-process.md) 完成发布：

1. 更新 `package.json` 版本号
2. 更新 `CHANGELOG.md`
3. 创建 Git 标签
4. 发布到 npm

---

## 命令设计指南

### 命名规范

- 使用小写字母和连字符: `my-command`
- 保持简洁: `status` 而非 `get-status`
- 动词优先: `post` 而非 `task-post`

### 选项设计

```typescript
program
    .command("example")
    .description("Short, clear description")
    .option("-f, --flag", "Boolean flag")
    .option("-v, --value <val>", "Option with value", "default")
    .requiredOption("-r, --required <val>", "Required option")
    .action(async (options) => {
        // Implementation
    });
```

### 输出规范

使用 `chalk` 进行颜色输出：

```typescript
import chalk from "chalk";

console.log(chalk.cyan.bold("🏟️  Title"));      // 标题
console.log(chalk.green("✅ Success"));         // 成功
console.log(chalk.red("❌ Error"));             // 错误
console.log(chalk.yellow("⚠️  Warning"));       // 警告
console.log(chalk.dim("ℹ️  Info"));             // 次要信息
```

### 错误处理

```typescript
try {
    // Command logic
} catch (error) {
    console.error(chalk.red("❌ Error:"), error instanceof Error ? error.message : String(error));
    process.exit(1);
}
```

---

## 示例命令模板

```typescript
// src/commands/my-command.ts
import chalk from "chalk";
import { config } from "../lib/config.js";
import { getClient } from "../lib/client.js";

export async function cmdMyCommand(options: {
    flag?: boolean;
    value?: string;
}) {
    console.log(chalk.cyan.bold("\n🏟️  My Command\n"));
    
    try {
        // Load config
        const cfg = config.getAll();
        console.log(chalk.dim(`Agent: ${cfg.agentId}`));
        
        // Get client if blockchain interaction needed
        const client = await getClient();
        
        // Execute command logic
        if (options.flag) {
            console.log(chalk.green("Flag is enabled"));
        }
        
        if (options.value) {
            console.log(chalk.yellow(`Value: ${options.value}`));
        }
        
        // Success output
        console.log(chalk.green("\n✅ Command completed successfully\n"));
        
    } catch (error) {
        console.error(chalk.red("\n❌ Command failed:"), 
            error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}
```

然后在 `index.ts` 中注册：

```typescript
import { cmdMyCommand } from "./commands/my-command.js";

program
    .command("my-command")
    .description("Description of what this command does")
    .option("-f, --flag", "Enable some flag")
    .option("-v, --value <val>", "Set a value")
    .action(cmdMyCommand);
```

---

## 测试新命令

```bash
# 本地开发测试
npm run dev -- changelog
npm run dev -- changelog --all

# 构建后测试
npm run build
node dist/index.js changelog
```
