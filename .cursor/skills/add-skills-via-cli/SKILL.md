---
name: add-skills-via-cli
description: Guides installing Agent Skills via npx skills add (Skills CLI). Use when the user wants to add skills from GitHub (e.g. facebook/react, vercel-labs/agent-skills), run npx skills add, install skills to Cursor, or discover/update/remove skills with the CLI.
---

# 使用 npx skills add 安装 Agent Skills

通过 Skills CLI 将可复用的 Agent Skills 安装到 Cursor 等编辑器中。技能来自 GitHub 等仓库中的 `SKILL.md` 文件。

## 基本命令

```bash
npx skills add <owner/repo>
```

示例：

```bash
# 从 GitHub 简写安装（推荐）
npx skills add facebook/react
npx skills add vercel-labs/agent-skills

# 仅安装到 Cursor
npx skills add vercel-labs/agent-skills -a cursor

# 非交互模式（CI/脚本友好）
npx skills add vercel-labs/agent-skills -y
```

## 常用选项

| 选项 | 说明 |
|------|------|
| `-g, --global` | 安装到用户目录（跨项目可用），默认装到当前项目 `.cursor/skills/` |
| `-a, --agent <name>` | 只安装到指定 agent，如 `cursor`、`claude-code` |
| `-s, --skill <name>` | 只安装指定技能（可多次）；`'*'` 表示该仓库下全部技能 |
| `-l, --list` | 只列出该仓库可用技能，不安装 |
| `-y, --yes` | 跳过确认提示 |
| `--all` | 将该仓库所有技能安装到所有已检测到的 agents |

## 安装前先查看技能列表

```bash
npx skills add facebook/react --list
npx skills add vercel-labs/agent-skills --list
```

若 `facebook/react` 当前未包含 skills 目录或 SKILL.md，会提示未找到技能。此时可改用包含 React 最佳实践的技能源，例如：

```bash
npx skills add vercel-labs/agent-skills --skill vercel-react-best-practices -a cursor
```

## 源格式

```bash
# GitHub 简写
npx skills add owner/repo

# 完整 GitHub URL
npx skills add https://github.com/vercel-labs/agent-skills

# 指向仓库内某个技能路径
npx skills add https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines

# 本地路径
npx skills add ./my-local-skills
```

## 其他常用命令

```bash
# 列出已安装技能
npx skills list
npx skills ls -a cursor

# 搜索技能（交互或关键词）
npx skills find
npx skills find react

# 检查/更新已安装技能
npx skills check
npx skills update

# 移除技能
npx skills remove <skill-name>
npx skills remove --global web-design-guidelines
```

## Cursor 安装位置

- **项目级**（默认）：`.cursor/skills/`，随项目提交、团队共享。
- **全局**（`-g`）：`~/.cursor/skills/`，对所有项目生效。

## 可选：禁用遥测

```bash
DISABLE_TELEMETRY=1 npx skills add owner/repo
```

## 参考

- 技能目录与安装说明：[skills.sh](https://skills.sh)
- CLI 文档：[skills.sh/docs/cli](https://skills.sh/docs/cli)
- 官方技能仓库示例：[vercel-labs/skills](https://github.com/vercel-labs/skills)、[vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills)
