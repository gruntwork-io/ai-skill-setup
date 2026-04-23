#!/usr/bin/env node
/**
 * Initialize a customer's infrastructure-live repo with Gruntwork MCP skills
 * for Claude Code, Codex, or both.
 *
 * Usage (published):
 *   npx @gruntwork-ai/skills-setup --target claude --repo . --key gw_mk_xxx
 *   npx @gruntwork-ai/skills-setup --target codex --codex-config project --key gw_mk_xxx
 *   npx @gruntwork-ai/skills-setup --target all --key gw_mk_xxx
 *
 * Flags:
 *   --target <claude|codex|all>    REQUIRED. Which agent(s) to set up.
 *   --repo <path>                  Target repo (default: cwd)
 *   --key <token>                  Gruntwork MCP access token (or env GRUNTWORK_MCP_API_KEY)
 *   --codex-config <project|global> Where to write Codex MCP config. If omitted
 *                                  when target includes codex, prompt on a TTY
 *                                  or error on non-TTY.
 *   --no-scan                      Skip the local stack detection scan.
 */
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { homedir } from "node:os"
import { createInterface } from "node:readline/promises"
import { parse as parseToml, stringify as stringifyToml } from "smol-toml"

const MCP_URL = "https://gruntwork-mcp-dev.vercel.app/api/mcp"
const TOKEN_URL = "https://app.gruntwork.io/settings/profile#mcp-access-tokens"

// --- Flag parsing ---

function getFlag(name: string): string | undefined {
  const idx = process.argv.indexOf(name)
  return idx >= 0 ? process.argv[idx + 1] : undefined
}

type Target = "claude" | "codex"
type CodexConfigScope = "project" | "global"

const targetRaw = getFlag("--target")
if (!targetRaw || !["claude", "codex", "all"].includes(targetRaw)) {
  console.error("Error: --target is required. One of: claude, codex, all")
  process.exit(1)
}
const targets: Target[] =
  targetRaw === "all" ? ["claude", "codex"] : [targetRaw as Target]

const repoPath = resolve(getFlag("--repo") ?? ".")
const apiKey = getFlag("--key") ?? process.env["GRUNTWORK_MCP_API_KEY"] ?? ""
const skipScan = process.argv.includes("--no-scan")

let codexConfigScope: CodexConfigScope | undefined
if (targets.includes("codex")) {
  const raw = getFlag("--codex-config")
  if (raw) {
    if (raw !== "project" && raw !== "global") {
      console.error("Error: --codex-config must be 'project' or 'global'")
      process.exit(1)
    }
    codexConfigScope = raw
  } else if (process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const answer = (await rl.question(
      "Where should Codex MCP config be written? [project=./.codex/config.toml, global=~/.codex/config.toml] (project/global): ",
    )).trim().toLowerCase()
    rl.close()
    if (answer !== "project" && answer !== "global") {
      console.error("Error: answer must be 'project' or 'global'")
      process.exit(1)
    }
    codexConfigScope = answer
  } else {
    console.error(
      "Error: --codex-config is required when --target includes codex and stdin is not a TTY. Pass --codex-config project or --codex-config global.",
    )
    process.exit(1)
  }
}

console.log(`Initializing Gruntwork skills (target: ${targets.join(", ")}) in: ${repoPath}`)

// --- Helpers ---

async function readFileIfExists(path: string): Promise<string | null> {
  try { return await readFile(path, "utf-8") } catch { return null }
}

async function writeFileEnsureDir(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, "utf-8")
}

async function readJsonIfExists<T = Record<string, unknown>>(path: string): Promise<T | null> {
  const content = await readFileIfExists(path)
  if (content === null) return null
  try {
    return JSON.parse(content) as T
  } catch (e) {
    throw new Error(
      `Existing ${path} is not valid JSON (${e instanceof Error ? e.message : String(e)}). ` +
      `Refusing to overwrite — fix or remove the file and re-run.`,
    )
  }
}

async function readTomlIfExists(path: string): Promise<Record<string, unknown> | null> {
  const content = await readFileIfExists(path)
  if (content === null) return null
  try {
    return parseToml(content) as Record<string, unknown>
  } catch (e) {
    throw new Error(
      `Existing ${path} is not valid TOML (${e instanceof Error ? e.message : String(e)}). ` +
      `Refusing to overwrite — fix or remove the file and re-run.`,
    )
  }
}

async function ensureGitignoreEntry(
  repoPath: string, entry: string,
): Promise<"created" | "added" | "already-present"> {
  const gitignorePath = join(repoPath, ".gitignore")
  const existing = await readFileIfExists(gitignorePath)
  if (existing === null) {
    await writeFile(gitignorePath, `${entry}\n`, "utf-8")
    return "created"
  }
  const hasLine = existing.split("\n").some(l => l.trim() === entry)
  if (hasLine) return "already-present"
  const separator = existing.endsWith("\n") ? "" : "\n"
  await writeFile(gitignorePath, `${existing}${separator}${entry}\n`, "utf-8")
  return "added"
}

async function findFiles(dir: string, pattern: RegExp, maxDepth = 4): Promise<string[]> {
  const results: string[] = []
  async function walk(d: string, depth: number) {
    if (depth > maxDepth) return
    try {
      const entries = await readdir(d, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue
        const full = join(d, entry.name)
        if (entry.isDirectory()) await walk(full, depth + 1)
        else if (pattern.test(entry.name)) results.push(full)
      }
    } catch { /* permission denied, etc */ }
  }
  await walk(dir, 0)
  return results
}

interface DetectedStack {
  version: string
  accounts: string[]
  regions: string[]
}

async function detectStack(rootPath: string): Promise<DetectedStack> {
  const hclFiles = await findFiles(rootPath, /\.hcl$/)
  const versions = new Set<string>()
  const regions = new Set<string>()

  for (const file of hclFiles) {
    const content = await readFileIfExists(file)
    if (!content) continue
    for (const match of content.matchAll(/source\s*=\s*"[^"]*gruntwork-io\/[^"?]+\?ref=([^"]+)"/g)) {
      versions.add(match[1]!)
    }
    const regionMatch = content.match(/aws_region\s*=\s*"([^"]+)"/)
    if (regionMatch) regions.add(regionMatch[1]!)
  }

  const accounts: string[] = []
  const rootAccountHcl = await readFileIfExists(join(rootPath, "account.hcl"))
  if (rootAccountHcl) {
    const nameMatch = rootAccountHcl.match(/account_name\s*=\s*"([^"]+)"/)
    if (nameMatch) accounts.push(nameMatch[1]!)
  }
  try {
    const entries = await readdir(rootPath, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue
      const acctHcl = await readFileIfExists(join(rootPath, entry.name, "account.hcl"))
      if (acctHcl) accounts.push(entry.name)
    }
  } catch { /* permission denied, etc */ }

  const latest = [...versions].sort().reverse()[0] ?? "unknown"
  return { version: latest, accounts, regions: [...regions] }
}

// --- Detect stack (unless --no-scan) ---

let detected: DetectedStack
if (skipScan) {
  console.log("  Scan skipped (--no-scan). Context file will be written with placeholders.")
  detected = { version: "unknown", accounts: [], regions: [] }
} else {
  detected = await detectStack(repoPath)
  console.log(`  Accounts: ${detected.accounts.length > 0 ? detected.accounts.join(", ") : "unknown"}`)
  console.log(`  Regions: ${detected.regions.length > 0 ? detected.regions.join(", ") : "unknown"}`)
  console.log(`  Latest module version: ${detected.version}`)
}

// --- Render context file (CLAUDE.md / AGENTS.md) ---

const versionLabel = detected.version !== "unknown"
  ? (detected.version.startsWith("v") ? detected.version : `v${detected.version}`)
  : (skipScan ? "(fill in your version — scan skipped)" : "(version not detected)")
const accountsLabel = detected.accounts.length > 0
  ? ` (accounts: ${detected.accounts.join(", ")})`
  : (skipScan ? " (fill in your accounts — scan skipped)" : "")
const regionsLabel = detected.regions.length > 0
  ? detected.regions.join(", ")
  : (skipScan ? "(fill in your regions — scan skipped)" : "not detected")

type AgentKind = "claude" | "codex"
function renderContextMd(kind: AgentKind): string {
  // Claude: `/gruntwork:find`. Codex: `$gruntwork-find` (or `/skills gruntwork-find`).
  const skills = [
    ["find", "discover modules for a requirement"],
    ["deploy", "scaffold Terragrunt configs for a module"],
    ["patcher", "audit module versions, apply patches and upgrades"],
    ["debug", "troubleshoot Terragrunt, OpenTofu/Terraform errors"],
    ["terragrunt", "explain Terragrunt concepts, blocks, functions, repo structure, migrations"],
  ]
  const skillsList = skills.map(([n, d]) =>
    kind === "claude"
      ? `- \`/gruntwork:${n}\` -- ${d}`
      : `- \`$gruntwork-${n}\` -- ${d}`,
  ).join("\n")

  return `# Infrastructure Repository

## Stack
- **IaC**: Terragrunt, OpenTofu/Terraform
- **Module Source**: Gruntwork Service Catalog ${versionLabel}
- **Cloud**: AWS${accountsLabel}
- **Regions**: ${regionsLabel}

## Repo Structure
- \`{account}/{region}/{category}/{module}/terragrunt.hcl\` -- per-unit config
- \`common.hcl\`, \`account.hcl\`, \`region.hcl\` -- hierarchical config

## Conventions
- Sources: \`git::git@github.com:gruntwork-io/{repo}.git//modules/{path}?ref={version}\`
- Dependencies: \`dependency {}\` blocks with \`mock_outputs\`

## MCP Server
Connected to the Gruntwork MCP server for module discovery, guidance, and semantic search.
Create access tokens at: ${TOKEN_URL}

## Available Skills
${skillsList}
`
}

if (targets.includes("claude")) {
  await writeFileEnsureDir(join(repoPath, "CLAUDE.md"), renderContextMd("claude"))
  console.log("  Wrote CLAUDE.md")
}
if (targets.includes("codex")) {
  await writeFileEnsureDir(join(repoPath, "AGENTS.md"), renderContextMd("codex"))
  console.log("  Wrote AGENTS.md")
}

// --- Claude: merge MCP config into .claude/settings.local.json ---

const bearerValue = apiKey
  ? `Bearer ${apiKey}`
  : `Bearer <your-access-token-from-${TOKEN_URL}>`

if (targets.includes("claude")) {
  const claudeDir = join(repoPath, ".claude")
  const settingsPath = join(claudeDir, "settings.local.json")

  interface ClaudeSettings {
    mcpServers?: Record<string, unknown>
    [key: string]: unknown
  }
  const existingSettings = (await readJsonIfExists<ClaudeSettings>(settingsPath)) ?? {}
  const existingMcp = (existingSettings.mcpServers ?? {}) as Record<string, unknown>

  const mergedSettings: ClaudeSettings = {
    ...existingSettings,
    mcpServers: {
      ...existingMcp,
      gruntwork: { url: MCP_URL, headers: { Authorization: bearerValue } },
    },
  }

  await writeFileEnsureDir(settingsPath, JSON.stringify(mergedSettings, null, 2) + "\n")
  const preservedKeys = Object.keys(existingSettings).filter(k => k !== "mcpServers" || Object.keys(existingMcp).length > 0)
  if (preservedKeys.length > 0) {
    console.log(`  Merged MCP config into .claude/settings.local.json (preserved ${preservedKeys.length} existing key(s))`)
  } else {
    console.log("  Wrote .claude/settings.local.json")
  }

  const action = await ensureGitignoreEntry(repoPath, ".claude/settings.local.json")
  if (action === "created") console.log("  Created .gitignore with .claude/settings.local.json")
  else if (action === "added") console.log("  Added .claude/settings.local.json to .gitignore")
}

// --- Codex: merge MCP config into .codex/config.toml (project or global) ---
//
// Codex's native MCP support is stdio-based, so we bridge the HTTP Gruntwork
// MCP server through `npx mcp-remote`. npx auto-fetches it at runtime.

if (targets.includes("codex")) {
  const codexConfigPath = codexConfigScope === "global"
    ? join(homedir(), ".codex", "config.toml")
    : join(repoPath, ".codex", "config.toml")

  const existingToml = (await readTomlIfExists(codexConfigPath)) ?? {}
  const existingServers = (existingToml["mcp_servers"] ?? {}) as Record<string, unknown>

  const gruntworkServer = {
    command: "npx",
    args: [
      "-y",
      "mcp-remote",
      MCP_URL,
      "--header",
      `Authorization: ${bearerValue}`,
    ],
  }

  const merged = {
    ...existingToml,
    mcp_servers: { ...existingServers, gruntwork: gruntworkServer },
  }

  await writeFileEnsureDir(codexConfigPath, stringifyToml(merged) + "\n")
  const scopeLabel = codexConfigScope === "global" ? "~/.codex/config.toml" : ".codex/config.toml"
  const preservedTop = Object.keys(existingToml).filter(k => k !== "mcp_servers" || Object.keys(existingServers).length > 0)
  if (preservedTop.length > 0) {
    console.log(`  Merged MCP config into ${scopeLabel} (preserved ${preservedTop.length} existing key(s))`)
  } else {
    console.log(`  Wrote ${scopeLabel}`)
  }

  // Only gitignore when we wrote into the repo. Global configs are outside the repo.
  if (codexConfigScope === "project") {
    const action = await ensureGitignoreEntry(repoPath, ".codex/config.toml")
    if (action === "created") console.log("  Created .gitignore with .codex/config.toml")
    else if (action === "added") console.log("  Added .codex/config.toml to .gitignore")
  }
}

// --- Copy skill / prompt files ---

const skillNames = ["find", "deploy", "patcher", "debug", "terragrunt"]
const skillsSrcDir = join(import.meta.dirname, "..", "skills")

// Codex skill names can't contain `:` (they map to `$name` invocation), so
// rewrite `name: gruntwork:find` → `name: gruntwork-find` in the frontmatter.
function rewriteNameForCodex(md: string, codexName: string): string {
  return md.replace(/^(name:\s*).+$/m, `$1${codexName}`)
}

for (const name of skillNames) {
  const src = join(skillsSrcDir, "gruntwork", `${name}.md`)
  const content = await readFileIfExists(src)
  if (!content) continue

  if (targets.includes("claude")) {
    const dst = join(repoPath, ".claude", "skills", "gruntwork", `${name}.md`)
    await writeFileEnsureDir(dst, content)
    console.log(`  Wrote .claude/skills/gruntwork/${name}.md`)
  }
  if (targets.includes("codex")) {
    // Codex reads skills from `.agents/skills/<skill>/SKILL.md` (repo-level,
    // parent-searched up to the repo root). Dir name == skill name.
    const codexName = `gruntwork-${name}`
    const dst = join(repoPath, ".agents", "skills", codexName, "SKILL.md")
    await writeFileEnsureDir(dst, rewriteNameForCodex(content, codexName))
    console.log(`  Wrote .agents/skills/${codexName}/SKILL.md`)
  }
}

// --- Done ---

console.log("")
if (!apiKey) {
  console.log("Next steps:")
  console.log(`  1. Create an access token at ${TOKEN_URL}`)
  if (targets.includes("claude")) console.log("  2. Update .claude/settings.local.json with your token")
  if (targets.includes("codex")) {
    const p = codexConfigScope === "global" ? "~/.codex/config.toml" : ".codex/config.toml"
    console.log(`  ${targets.includes("claude") ? "3" : "2"}. Update ${p} with your token`)
  }
  console.log("  Then restart your agent.")
} else {
  const names = targets.map(t => t === "claude" ? "Claude Code" : "Codex").join(" and ")
  console.log(`Done! Restart ${names} to pick up the Gruntwork MCP server.`)
}
