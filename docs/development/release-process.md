# Release Process

> 标准化的版本发布流程，确保每次发布都有完整的记录和检查

---

## 发布检查清单

每次发布新版本前，必须完成以下检查：

### ✅ 1. 代码准备

- [ ] 所有测试通过 (`npm test`)
- [ ] 代码审查通过 (至少 1 个 approve)
- [ ] 文档已更新 (README, API docs)

### ✅ 2. 版本号更新

- [ ] `cli/package.json` version 已更新
- [ ] `sdk/package.json` version 已更新 (如果有变更)
- [ ] `skill/package.json` version 已更新 (如果有变更)
- [ ] 版本符合 [SemVer](https://semver.org/):
  - `major`: 不兼容的 API 变更
  - `minor`: 向后兼容的功能添加
  - `patch`: 向后兼容的问题修复

### ✅ 3. CHANGELOG.md 更新

- [ ] 在 `[Unreleased]` 上方添加新版本
- [ ] 日期格式: `YYYY-MM-DD`
- [ ] 包含适当的分类:
  - `Added`: 新功能
  - `Changed`: 现有功能变更
  - `Deprecated`: 即将移除的功能
  - `Removed`: 已移除的功能
  - `Fixed`: Bug 修复
  - `Security`: 安全修复

**CHANGELOG 格式示例:**

```markdown
## [1.9.0] - 2026-03-30

### Added
- `arena changelog` command — display project changelog in terminal
- Heartbeat auto-retry with exponential backoff

### Changed
- Improved error messages for OnchainOS connection failures
- Updated default gas limit for task posting

### Fixed
- Fixed race condition in agent loop when multiple tasks arrive simultaneously
- Fixed memory leak in long-running daemon mode

### Security
- Updated dependencies to fix CVE-2026-xxxxx
```

### ✅ 4. Git 标签

- [ ] 创建标签: `git tag -a cli@1.9.0 -m "Release CLI 1.9.0"`
- [ ] 推送标签: `git push origin cli@1.9.0`

### ✅ 5. 发布到 npm

```bash
# CLI
cd cli
npm run build
npm publish --access public

# SDK (如果需要)
cd ../sdk
npm run build
npm publish --access public

# Skill (如果需要)
cd ../skill
npm publish --access public
```

### ✅ 6. 验证发布

- [ ] npm 包可以正常安装: `npm install -g @daviriansu/arena-cli@latest`
- [ ] 版本号正确: `arena --version`
- [ ] `arena changelog` 显示新版本
- [ ] 核心功能正常工作

---

## 自动化工具

### CI 自动检查

我们使用 GitHub Actions 自动检查 CHANGELOG 更新：

```yaml
# .github/workflows/changelog-check.yml
# 当 package.json 变更但未更新 CHANGELOG 时阻止合并
```

### CLI 快捷命令

```bash
# 查看当前版本
arena --version

# 查看 changelog
arena changelog           # 显示最近 2-3 个版本
arena changelog --all     # 显示完整 changelog
```

---

## 版本命名约定

| 包 | 格式 | 示例 |
|---|---|---|
| CLI | `major.minor.patch` | `1.8.0` |
| SDK | `major.minor.patch` | `1.0.0` |
| Skill | `major.minor.patch` | `1.2.1` |
| 合约 | `vMajor.Minor` | `v1.2` |

### Git 标签格式

```bash
# CLI
git tag -a cli@1.8.0 -m "Release CLI 1.8.0"

# SDK
git tag -a sdk@1.0.0 -m "Release SDK 1.0.0"

# 合约
git tag -a contract@v1.2 -m "Release Contract v1.2"

# Skill
git tag -a skill@1.2.1 -m "Release Skill 1.2.1"
```

---

## 紧急发布流程

对于紧急安全修复：

1. **创建 hotfix 分支**:
   ```bash
   git checkout -b hotfix/security-fix main
   ```

2. **应用修复**并更新版本号 (patch 级别)

3. **更新 CHANGELOG**:
   ```markdown
   ### Security
   - Fixed CVE-2026-xxxxx: [description]
   ```

4. **快速审查** (1 人 approve 即可)

5. **合并并发布**:
   ```bash
   git checkout main
   git merge hotfix/security-fix
   git tag -a cli@1.8.1 -m "Security fix release 1.8.1"
   git push origin main --tags
   ```

6. **通知社区** (Discord, Twitter)

---

## 常见问题

### Q: 我忘了更新 CHANGELOG，但已经提交了怎么办？

A: 可以追加提交：
```bash
# 修改 CHANGELOG.md
git add CHANGELOG.md
git commit --amend --no-edit
git push --force-with-lease
```

### Q: 如何处理多个包的版本不一致？

A: 每个包独立管理版本：
- CLI 升级到 1.9.0
- SDK 保持 1.0.0 (无变更)
- Skill 升级到 1.3.0 (有变更)

分别打标签：
```bash
git tag -a cli@1.9.0 -m "CLI 1.9.0"
git tag -a skill@1.3.0 -m "Skill 1.3.0"
```

### Q: CI 检查失败了怎么办？

A: 检查错误信息：
1. 如果是 "CHANGELOG not updated" → 添加 CHANGELOG 条目
2. 如果是 "missing [Unreleased] section" → 修复 CHANGELOG 格式
3. 如果是版本不一致 → 确保 package.json 和 CHANGELOG 版本匹配

---

## 参考

- [Keep a Changelog](https://keepachangelog.com/)
- [Semantic Versioning](https://semver.org/)
- [npm version](https://docs.npmjs.com/cli/v8/commands/npm-version)
