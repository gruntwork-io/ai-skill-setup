#!/usr/bin/env node
/**
 * Initialize a customer's infrastructure-live repo with Gruntwork MCP skills.
 *
 * Usage (published):
 *   npx @gruntwork-ai/skills-setup --repo ./infrastructure-live --key gw_mk_xxx
 * Usage (in-repo dev):
 *   bun packages/ai-setup/src/init.ts --repo /path/to/infra-live
 *
 * Flags:
 *   --repo <path>   Target repo (default: cwd)
 *   --key <token>   Gruntwork MCP access token (or set GRUNTWORK_MCP_API_KEY)
 *   --no-scan       Skip the local filesystem scan for Gruntwork modules,
 *                   accounts, and regions. CLAUDE.md is still written with
 *                   placeholders. Nothing leaves the machine either way.
 *
 * What it does:
 *   1. (unless --no-scan) Detects stack by reading *.hcl files up to 4 levels
 *      deep — Gruntwork source URLs, account names, and aws_region values.
 *      All local I/O; no network calls.
 *   2. Writes CLAUDE.md with detected context (or placeholders if --no-scan)
 *   3. Merges MCP server config into .claude/settings.local.json (preserves
 *      any existing keys; refuses to overwrite if the file isn't valid JSON).
 *      Personal/per-dev scope — the access token lives here.
 *   4. Ensures .gitignore has `.claude/settings.local.json` so the token
 *      doesn't accidentally get committed.
 *   5. Copies skill files to .claude/skills/
 */
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"

const MCP_URL = "https://gruntwork-mcp-dev.vercel.app/api/mcp"

function getFlag(name: string): string | undefined {
  const idx = process.argv.indexOf(name)
  return idx >= 0 ? process.argv[idx + 1] : undefined
}

const repoPath = resolve(getFlag("--repo") ?? ".")
const apiKey = getFlag("--key") ?? process.env["GRUNTWORK_MCP_API_KEY"] ?? ""
const skipScan = process.argv.includes("--no-scan")

console.log(`Initializing Gruntwork MCP skills in: ${repoPath}`)

// --- Helpers ---

async function readFileIfExists(path: string): Promise<string | null> {
  try { return await readFile(path, "utf-8") } catch { return null }
}

// Node's writeFile won't create missing parent dirs — mkdir first.
async function writeFileEnsureDir(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, "utf-8")
}

// Read + parse JSON. Returns null on missing; THROWS on invalid JSON so we never
// silently clobber a file the user was editing.
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

// Ensure `entry` appears on its own line in `<repoPath>/.gitignore`.
// Creates the file if missing. Returns what action was taken so we can log it.
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
  console.log("  Scan skipped (--no-scan). CLAUDE.md will be written with placeholders.")
  detected = { version: "unknown", accounts: [], regions: [] }
} else {
  detected = await detectStack(repoPath)
  console.log(`  Accounts: ${detected.accounts.length > 0 ? detected.accounts.join(", ") : "unknown"}`)
  console.log(`  Regions: ${detected.regions.length > 0 ? detected.regions.join(", ") : "unknown"}`)
  console.log(`  Latest module version: ${detected.version}`)
}

// --- Write CLAUDE.md ---

const versionLabel = detected.version !== "unknown"
  ? (detected.version.startsWith("v") ? detected.version : `v${detected.version}`)
  : (skipScan ? "(fill in your version — scan skipped)" : "(version not detected)")
const accountsLabel = detected.accounts.length > 0
  ? ` (accounts: ${detected.accounts.join(", ")})`
  : (skipScan ? " (fill in your accounts — scan skipped)" : "")
const regionsLabel = detected.regions.length > 0
  ? detected.regions.join(", ")
  : (skipScan ? "(fill in your regions — scan skipped)" : "not detected")

const repoStructureLines = [
  "- `{account}/{region}/{category}/{module}/terragrunt.hcl` -- per-unit config",
  "- `common.hcl`, `account.hcl`, `region.hcl` -- hierarchical config",
].join("\n")

const claudeMd = `# Infrastructure Repository

## Stack
- **IaC**: Terragrunt, OpenTofu/Terraform
- **Module Source**: Gruntwork Service Catalog ${versionLabel}
- **Cloud**: AWS${accountsLabel}
- **Regions**: ${regionsLabel}

## Repo Structure
${repoStructureLines}

## Conventions
- Sources: \`git::git@github.com:gruntwork-io/{repo}.git//modules/{path}?ref={version}\`
- Dependencies: \`dependency {}\` blocks with \`mock_outputs\`

## MCP Server
Connected to the Gruntwork MCP server for module discovery, guidance, and semantic search.
Create access tokens at: https://app.gruntwork.io/settings/profile#mcp-access-tokens

## Available Skills
- \`/gruntwork:find\` -- discover modules for a requirement
- \`/gruntwork:deploy\` -- scaffold Terragrunt configs for a module
- \`/gruntwork:patcher\` -- audit module versions, apply patches and upgrades
- \`/gruntwork:debug\` -- troubleshoot Terragrunt, OpenTofu/Terraform errors
- \`/gruntwork:terragrunt\` -- explain Terragrunt concepts, blocks, functions, repo structure, migrations
`

await writeFileEnsureDir(join(repoPath, "CLAUDE.md"), claudeMd)
console.log("  Wrote CLAUDE.md")

// --- Merge MCP config into .claude/settings.local.json ---
//
// We write to settings.local.json (not settings.json) because the access token
// is per-developer. If the user already has local settings (other MCP servers,
// hooks, permissions), we preserve every top-level key and only replace the
// `mcpServers.gruntwork` entry. If the file is present but unparseable we
// refuse to overwrite — better to fail loudly than silently clobber.

const claudeDir = join(repoPath, ".claude")
const skillsDir = join(claudeDir, "skills")
const settingsPath = join(claudeDir, "settings.local.json")

interface ClaudeSettings {
  mcpServers?: Record<string, unknown>
  [key: string]: unknown
}
const existingSettings = (await readJsonIfExists<ClaudeSettings>(settingsPath)) ?? {}
const existingMcp = (existingSettings.mcpServers ?? {}) as Record<string, unknown>

const gruntworkEntry = {
  url: MCP_URL,
  headers: {
    Authorization: apiKey ? `Bearer ${apiKey}` : "Bearer <your-access-token-from-app.gruntwork.io/settings/profile#mcp-access-tokens>",
  },
}

const mergedSettings: ClaudeSettings = {
  ...existingSettings,
  mcpServers: { ...existingMcp, gruntwork: gruntworkEntry },
}

await writeFileEnsureDir(settingsPath, JSON.stringify(mergedSettings, null, 2) + "\n")
const existingKeys = Object.keys(existingSettings).filter(k => k !== "mcpServers" || Object.keys(existingMcp).length > 0)
if (existingKeys.length > 0) {
  console.log(`  Merged MCP config into .claude/settings.local.json (preserved ${existingKeys.length} existing key(s))`)
} else {
  console.log("  Wrote .claude/settings.local.json")
}

// --- Ensure .gitignore keeps the token out of version control ---

const gitignoreAction = await ensureGitignoreEntry(repoPath, ".claude/settings.local.json")
if (gitignoreAction === "created") {
  console.log("  Created .gitignore with .claude/settings.local.json")
} else if (gitignoreAction === "added") {
  console.log("  Added .claude/settings.local.json to .gitignore")
}
// Silent if already present — don't clutter the output.

// --- Copy skill files ---

// Skills ship under a `gruntwork/` namespace dir per Claude Code convention —
// each file becomes a `gruntwork:<name>` skill. Both published and in-repo
// layouts have the skills dir as a sibling of the entrypoint script.
//   dist/init.js  +  skills/gruntwork/*.md     (published)
//   src/init.ts   +  skills/gruntwork/*.md     (in-repo)
const skillsSrcDir = join(import.meta.dirname, "..", "skills")
const skillFiles = [
  "gruntwork/find.md",
  "gruntwork/deploy.md",
  "gruntwork/patcher.md",
  "gruntwork/debug.md",
  "gruntwork/terragrunt.md",
]

for (const file of skillFiles) {
  const content = await readFileIfExists(join(skillsSrcDir, file))
  if (content) {
    await writeFileEnsureDir(join(skillsDir, file), content)
    console.log(`  Wrote .claude/skills/${file}`)
  }
}

// --- Done ---

console.log("")
if (!apiKey) {
  console.log("Next steps:")
  console.log("  1. Create an access token at https://app.gruntwork.io/settings/profile#mcp-access-tokens")
  console.log("  2. Update .claude/settings.local.json with your token")
  console.log("  3. Restart Claude Code")
} else {
  console.log("Done! Restart Claude Code to pick up the Gruntwork MCP server.")
}
