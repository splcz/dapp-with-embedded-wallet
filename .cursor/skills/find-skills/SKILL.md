---
name: find-skills
description: Helps users discover and install agent skills when they ask "how do I do X", "find a skill for X", "is there a skill that can...", or want to extend capabilities. Use when the user is looking for functionality that might exist as an installable skill.
---

# Find Skills

Helps discover and install skills from the open agent skills ecosystem.

## When to Use This Skill

Use when the user:

- Asks "how do I do X" where X might be a common task with an existing skill
- Says "find a skill for X" or "is there a skill for X"
- Asks "can you do X" where X is a specialized capability
- Wants to extend agent capabilities or search for tools, templates, or workflows
- Mentions help with a specific domain (design, testing, deployment, etc.)

## Skills CLI

The Skills CLI (`npx skills`) is the package manager for agent skills.

**Key commands:**

- `npx skills find [query]` — Search for skills by keyword
- `npx skills add <source>` — Install a skill from GitHub or other sources
- `npx skills check` — Check for updates
- `npx skills update` — Update installed skills

**Browse:** https://skills.sh/

## How to Help Users Find Skills

### Step 1: Understand What They Need

Identify: (1) domain (e.g., React, testing, design), (2) specific task, (3) whether a skill likely exists.

### Step 2: Search

```bash
npx skills find [query]
```

Examples:

- "how do I make my React app faster?" → `npx skills find react performance`
- "help with PR reviews?" → `npx skills find pr review`
- "create a changelog" → `npx skills find changelog`

### Step 3: Present Options

When you find relevant skills, show:

1. Skill name and what it does
2. Install command
3. Link to skills.sh

Example:

```
I found a skill that might help: "vercel-react-best-practices" (React/Next.js performance from Vercel).

Install: npx skills add vercel-labs/agent-skills@vercel-react-best-practices
Learn more: https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices
```

### Step 4: Offer to Install

```bash
npx skills add <owner/repo@skill> -g -y
```

`-g` = global (user-level), `-y` = skip confirmation.

## Common Categories

| Category       | Example Queries                          |
|----------------|------------------------------------------|
| Web Development| react, nextjs, typescript, css, tailwind |
| Testing        | testing, jest, playwright, e2e          |
| DevOps         | deploy, docker, kubernetes, ci-cd        |
| Documentation  | docs, readme, changelog, api-docs        |
| Code Quality   | review, lint, refactor, best-practices   |
| Design         | ui, ux, design-system, accessibility    |
| Productivity   | workflow, automation, git                |

## Search Tips

1. Use specific keywords: e.g. "react testing" rather than just "testing"
2. Try alternatives: "deploy" → "deployment" or "ci-cd"
3. Common sources: `vercel-labs/agent-skills`, `vercel-labs/skills`

## When No Skills Are Found

1. Say no matching skill was found
2. Offer to help with the task directly
3. Suggest creating a custom skill: `npx skills init my-xyz-skill`

## Updating This Skill from Upstream

To reinstall or update this skill from vercel-labs/skills:

```bash
npx skills add https://github.com/vercel-labs/skills --skill find-skills
```

Use `-g` for global, `-y` for non-interactive.
