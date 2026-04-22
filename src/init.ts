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
 *   --key <key>     Gruntwork MCP API key (or set GRUNTWORK_MCP_API_KEY)
 *   --no-scan       Skip the local filesystem scan for Gruntwork modules,
 *                   accounts, and regions. CLAUDE.md is still written with
 *                   placeholders. Nothing leaves the machine either way.
 *
 * What it does:
 *   1. (unless --no-scan) Detects stack by reading *.hcl files up to 4 levels
 *      deep — Gruntwork source URLs, account names, and aws_region values.
 *      All local I/O; no network calls.
 *   2. Writes CLAUDE.md with detected context (or placeholders if --no-scan)
 *   3. Writes .claude/settings.json with MCP server config
 *   4. Copies skill files to .claude/skills/
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

const claudeMd = `# Infrastructure Repository

## Stack
- **IaC**: Terragrunt, OpenTofu/Terraform
- **Module Source**: Gruntwork Service Catalog ${versionLabel}
- **Cloud**: AWS${accountsLabel}
- **Regions**: ${regionsLabel}

## Repo Structure
- \`_envcommon/\` -- shared module configs (base templates)
- \`{account}/{region}/{category}/{module}/terragrunt.hcl\` -- env overrides
- \`common.hcl\`, \`account.hcl\`, \`region.hcl\` -- hierarchical config

## Conventions
- Sources: \`git::git@github.com:gruntwork-io/{repo}.git//modules/{path}?ref={version}\`
- Dependencies: \`dependency {}\` blocks with \`mock_outputs\`

## MCP Server
Connected to the Gruntwork MCP server for module discovery, guidance, and semantic search.
Create API keys at: https://app.gruntwork.io/settings/api-keys

## Available Skills
- \`/gruntwork-find\` -- discover modules for a requirement
- \`/gruntwork-deploy\` -- scaffold Terragrunt configs for a module
- \`/gruntwork-patcher\` -- audit module versions, apply patches and upgrades
- \`/gruntwork-debug\` -- troubleshoot Terragrunt, OpenTofu/Terraform errors
- \`/gruntwork-terragrunt\` -- explain Terragrunt concepts, blocks, functions, repo structure, migrations
`

await writeFileEnsureDir(join(repoPath, "CLAUDE.md"), claudeMd)
console.log("  Wrote CLAUDE.md")

// --- Write .claude/settings.json ---

const claudeDir = join(repoPath, ".claude")
const skillsDir = join(claudeDir, "skills")
await writeFileEnsureDir(join(claudeDir, "settings.json"), JSON.stringify({
  mcpServers: {
    gruntwork: {
      url: MCP_URL,
      headers: {
        Authorization: apiKey ? `Bearer ${apiKey}` : "Bearer <your-api-key-from-app.gruntwork.io/settings/api-keys>",
      },
    },
  },
}, null, 2) + "\n")
console.log("  Wrote .claude/settings.json")

// --- Copy skill files ---

// Skills ship as sibling to the compiled entrypoint:
//   dist/init.js  +  skills/*.md     (published layout)
//   src/init.ts   +  skills/*.md     (in-repo layout)
// In both cases, `../skills` from the script's dir resolves correctly.
const skillsSrcDir = join(import.meta.dirname, "..", "skills")
const skillFiles = ["gruntwork-find.md", "gruntwork-deploy.md", "gruntwork-patcher.md", "gruntwork-debug.md", "gruntwork-terragrunt.md"]

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
  console.log("  1. Create an API key at https://app.gruntwork.io/settings/api-keys")
  console.log("  2. Update .claude/settings.json with your key")
  console.log("  3. Restart Claude Code")
} else {
  console.log("Done! Restart Claude Code to pick up the Gruntwork MCP server.")
}
