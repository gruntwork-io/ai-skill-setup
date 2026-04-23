# @gruntwork-ai/skills-setup

One-command bootstrap for a [Claude Code](https://claude.com/claude-code) or [Codex](https://github.com/openai/codex) workspace that knows how to work with [Gruntwork](https://gruntwork.io) modules, Terragrunt, and OpenTofu/Terraform.

Run it inside an infrastructure-live repo and it wires up the Gruntwork MCP server, a set of skills/prompts, and a context file with your detected stack.

## Quick start

```bash
# Claude Code
npx @gruntwork-ai/skills-setup --target claude --key gw_mk_xxxxxxxxxxxxx

# Codex (writes MCP config to ./.codex/config.toml)
npx @gruntwork-ai/skills-setup --target codex --codex-config project --key gw_mk_xxxxxxxxxxxxx

# Both
npx @gruntwork-ai/skills-setup --target all --codex-config project --key gw_mk_xxxxxxxxxxxxx
```

Then restart your agent. The Gruntwork MCP tools and Gruntwork skills will be available.

Get an access token at [app.gruntwork.io/settings/profile#mcp-access-tokens](https://app.gruntwork.io/settings/profile#mcp-access-tokens). If you don't pass `--key`, the tool still scaffolds everything — it just leaves a placeholder for you to fill in.

## Options

| Flag | Description |
|------|-------------|
| `--target <claude\|codex\|all>` | **Required.** Which agent(s) to configure. |
| `--repo <path>` | Target repo (default: current directory) |
| `--key <token>` | Gruntwork MCP access token. Alternative: set `GRUNTWORK_MCP_API_KEY` |
| `--codex-config <project\|global>` | Where to write Codex's MCP config. `project` → `./.codex/config.toml` (gitignored). `global` → `~/.codex/config.toml`. If omitted when target includes codex, you'll be prompted on a TTY. Required in non-interactive environments. |
| `--no-scan` | Skip the local filesystem scan (see below). The context file is still written with placeholders. |

## What gets written

### `--target claude`

- **`.claude/settings.local.json`** — merges the Gruntwork MCP server config (with your access token) into your personal Claude Code settings. Existing keys are preserved; if the file isn't valid JSON, the tool refuses to overwrite. A matching `.gitignore` entry is added automatically so the token doesn't get committed.
- **`.claude/skills/gruntwork/*.md`** — Claude skills (`/gruntwork:find`, `/gruntwork:deploy`, `/gruntwork:debug`, `/gruntwork:patcher`, `/gruntwork:terragrunt`).
- **`CLAUDE.md`** — a detected-stack summary.

### `--target codex`

- **`.codex/config.toml`** (project) or **`~/.codex/config.toml`** (global) — merges a `[mcp_servers.gruntwork]` entry that bridges the HTTP Gruntwork MCP server through `npx mcp-remote` (auto-fetched at runtime). Existing tables are preserved; invalid TOML is never overwritten. Project-scoped writes also update `.gitignore`.
- **`.codex/prompts/gruntwork-*.md`** — Codex prompts (`/gruntwork-find`, `/gruntwork-deploy`, `/gruntwork-debug`, `/gruntwork-patcher`, `/gruntwork-terragrunt`).
- **`AGENTS.md`** — a detected-stack summary.

### `--target all`

Writes both sets. `CLAUDE.md` and `AGENTS.md` both get written with the same detected content.

## What the scan does (and doesn't do)

By default, before writing anything, the tool walks the target repo up to **4 directories deep** and reads every `*.hcl` file it finds, looking for three things:

- **Gruntwork module versions** — regex-matches `source = "...gruntwork-io/<repo>?ref=<version>"` lines to determine which version of the Gruntwork Service Catalog you're on
- **Account names** — reads `account.hcl` at the repo root and at each first-level subdirectory, pulling `account_name = "..."` values
- **AWS regions** — regex-matches `aws_region = "..."` lines

These detected values are written into the context file (`CLAUDE.md` and/or `AGENTS.md`) so your agent has accurate stack context (e.g., knowing you run in `us-east-1` and `us-west-2` across a `prod` and `stage` account on Gruntwork `v0.140.0`). The scan is used for context only; it doesn't influence the skill prompts or the MCP configuration, and **nothing ever leaves your machine** — there are zero network calls during the scan.

Skipped files: anything under a dotfile directory (e.g., `.git`, `.terragrunt-cache`) or `node_modules`.

Pass `--no-scan` to skip this entirely. Useful when:

- You're running in CI and want deterministic, side-effect-free behavior
- You have a non-standard repo layout where the heuristics would produce misleading values
- You prefer to fill in the context file by hand
- The repo is very large and you want to skip the filesystem walk

## Skills installed

| Purpose | Claude | Codex |
|---------|--------|-------|
| Discover the right Gruntwork module for an infrastructure requirement | `/gruntwork:find` | `/gruntwork-find` |
| Scaffold Terragrunt configs for a specific Gruntwork module | `/gruntwork:deploy` | `/gruntwork-deploy` |
| Audit module versions, apply patches and upgrades | `/gruntwork:patcher` | `/gruntwork-patcher` |
| Troubleshoot Terragrunt, OpenTofu/Terraform errors | `/gruntwork:debug` | `/gruntwork-debug` |
| Explain Terragrunt concepts, blocks, functions, repo structure, migrations | `/gruntwork:terragrunt` | `/gruntwork-terragrunt` |

Each skill is a Markdown file — open any of them in `.claude/skills/gruntwork/` or `.codex/prompts/` to read or customize the prompt.

## Requirements

- Node.js ≥ 20.11
- [Claude Code](https://claude.com/claude-code) or [Codex](https://github.com/openai/codex)
- A Gruntwork account with MCP access

## Links

- This package's source: [gruntwork-io/ai-skill-setup](https://github.com/gruntwork-io/ai-skill-setup)
- Report an issue: [github.com/gruntwork-io/ai-skill-setup/issues](https://github.com/gruntwork-io/ai-skill-setup/issues)

## License

MIT
