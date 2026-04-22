---
name: gruntwork:terragrunt
description: Explain Terragrunt concepts, patterns, and syntax (blocks, functions, repo structure, migrations)
---

# Terragrunt Guidance

When the user asks about Terragrunt itself — how blocks work, what a function does, how to structure an infrastructure-live repo, how to migrate from a terralith, how `run-all` and stacks behave, how caching or filtering works — use this skill. This skill is NOT for wiring a specific Gruntwork module into a repo (use `/gruntwork:deploy` for that — it also has the canonical guidance on building reusable higher-order patterns with `terragrunt.stack.hcl`), and NOT for diagnosing a specific error message (use `/gruntwork:debug`).

## Steps

1. Classify the question:
   - **Reference lookup** (named block, function, or feature — e.g. "what does `dependency` do?", "how does `find_in_parent_folders` work?", "what are stacks?") → step 2
   - **Tutorial / conceptual** (e.g. "how do I migrate a terralith to Terragrunt?", "how should I structure my live repo?", "when should I use `include` vs `dependency`?") → step 3
   - **Both** → do step 2 first for the precise syntax, then step 3 for the surrounding narrative.

2. For reference lookup, call `get_terragrunt_guidance`:
   - `topic` = the category: `blocks`, `functions`, `patterns`, `stacks`, `caching`, `filtering`
   - `section` = the specific name if you know it (e.g. `dependency`, `find_in_parent_folders`, `terraform`)
   - `detail` = `summary` unless the user asks for full docs
   - If the tool returns "Section not found", it prints `available_sections` — pick the closest match and retry.

3. For tutorial / conceptual questions, call `semantic_search`:
   - Pass the user's question as `query` verbatim (Terragrunt docs including the `terralith-to-terragrunt` guide and `llms-full.txt` are indexed under `repo: terragrunt`, `content_type: terragrunt-docs`).
   - Don't over-filter — leave `content_type` unset. The Terragrunt-docs chunks are the best match for these queries already.
   - Read the top 3–5 results. The `chunk_id` is the source URL — cite it.

4. If the question involves a Gruntwork module alongside Terragrunt syntax (e.g. "how do I use `dependency` to pass VPC outputs into my RDS module?"), also call `get_example` on the Gruntwork module to show the canonical pattern in context.

5. Answer with:
   - A direct, minimal example of the syntax (real HCL, not pseudocode)
   - The "why" — what the feature is for, what it replaces, what it's not for
   - A link to the source doc (the URL from `chunk_id` or the `get_terragrunt_guidance` output's `source` field)

## Important

- Say "Terragrunt, OpenTofu/Terraform" (Terragrunt first, never just "Terraform")
- Terragrunt is distinct from Gruntwork modules — a user can ask a pure-Terragrunt question without any Gruntwork module involved. Don't assume Gruntwork context unless the question mentions it.
- Prefer `get_terragrunt_guidance` over `semantic_search` for **named** blocks/functions — it's structured reference lookup and gives exact syntax with less noise.
- Prefer `semantic_search` for **tutorial**-shaped questions (step-by-step guides, migration paths, design decisions) — reference-lookup tools can't cover these.
- Never invent Terragrunt syntax. If neither tool returns a clear answer, say so rather than guessing.
- When showing HCL, use real function calls (`find_in_parent_folders("root.hcl")`, `get_terragrunt_dir()`), not placeholder strings.
