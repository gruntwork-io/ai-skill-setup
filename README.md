# @gruntwork-ai/skills-setup

One-command bootstrap for a [Claude Code](https://claude.com/claude-code) workspace that knows how to work with [Gruntwork](https://gruntwork.io) modules, Terragrunt, and OpenTofu/Terraform.

Run it inside an infrastructure-live repo and it wires up:

- **`.claude/settings.local.json`** — merges the Gruntwork MCP server config (with your access token) into your personal Claude Code settings. Existing keys are preserved; if the file isn't valid JSON, the tool refuses to overwrite. A matching `.gitignore` entry is added automatically so the token doesn't get committed.
- **`.claude/skills/`** — a set of Claude Code skills (`/gruntwork:find`, `/gruntwork:deploy`, `/gruntwork:debug`, `/gruntwork:patcher`, `/gruntwork:terragrunt`)
- **`CLAUDE.md`** — a detected-stack summary so Claude has context (modules in use, accounts, regions, Gruntwork version)

## Quick start

```bash
npx @gruntwork-ai/skills-setup --repo . --key gw_mk_xxxxxxxxxxxxx
```

Then restart Claude Code. The Gruntwork MCP tools and `/gruntwork:*` skills will be available.

Get an access token at [app.gruntwork.io/settings/profile#mcp-access-tokens](https://app.gruntwork.io/settings/profile#mcp-access-tokens). If you don't pass `--key`, the tool still scaffolds everything — it just leaves a placeholder for you to fill in.

## Options

| Flag | Description |
|------|-------------|
| `--repo <path>` | Target repo (default: current directory) |
| `--key <token>` | Gruntwork MCP access token. Alternative: set `GRUNTWORK_MCP_API_KEY` |
| `--no-scan` | Skip the local filesystem scan (see below). `CLAUDE.md` is still written with placeholders for you to fill in. |

## What the scan does (and doesn't do)

By default, before writing anything, the tool walks the target repo up to **4 directories deep** and reads every `*.hcl` file it finds, looking for three things:

- **Gruntwork module versions** — regex-matches `source = "...gruntwork-io/<repo>?ref=<version>"` lines to determine which version of the Gruntwork Service Catalog you're on
- **Account names** — reads `account.hcl` at the repo root and at each first-level subdirectory, pulling `account_name = "..."` values
- **AWS regions** — regex-matches `aws_region = "..."` lines

These detected values are written into **`CLAUDE.md`** — and only `CLAUDE.md` — so Claude Code has accurate stack context in every session (e.g., knowing you run in `us-east-1` and `us-west-2` across a `prod` and `stage` account on Gruntwork `v0.140.0`). The scan is used for context only; it doesn't influence the skill prompts or the MCP configuration, and **nothing ever leaves your machine** — there are zero network calls during the scan.

Skipped files: anything under a dotfile directory (e.g., `.git`, `.terragrunt-cache`) or `node_modules`.

Pass `--no-scan` to skip this entirely. Useful when:

- You're running in CI and want deterministic, side-effect-free behavior
- You have a non-standard repo layout where the heuristics would produce misleading values
- You prefer to fill in `CLAUDE.md` by hand
- The repo is very large and you want to skip the filesystem walk

## Skills installed

| Skill | Purpose |
|-------|---------|
| `/gruntwork:find` | Discover the right Gruntwork module for an infrastructure requirement |
| `/gruntwork:deploy` | Scaffold Terragrunt configs for a specific Gruntwork module |
| `/gruntwork:patcher` | Audit module versions, apply patches and upgrades |
| `/gruntwork:debug` | Troubleshoot Terragrunt, OpenTofu/Terraform errors |
| `/gruntwork:terragrunt` | Explain Terragrunt concepts, blocks, functions, repo structure, migrations |

Each skill is a Markdown file with frontmatter — open any of them in `.claude/skills/` to read or customize the prompt.

## Requirements

- Node.js ≥ 20.11
- [Claude Code](https://claude.com/claude-code)
- A Gruntwork account with MCP access

## Links

- This package's source: [gruntwork-io/ai-skill-setup](https://github.com/gruntwork-io/ai-skill-setup)
- Report an issue: [github.com/gruntwork-io/ai-skill-setup/issues](https://github.com/gruntwork-io/ai-skill-setup/issues)

## License

MIT
