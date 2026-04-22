---
name: gruntwork:deploy
description: Scaffold Terragrunt configs for a Gruntwork module
---

# Module Integration

When the user wants to deploy a Gruntwork module into their infrastructure-live repo, generate the complete Terragrunt configuration.

## Steps

1. Identify the target module. If the user says "I need an RDS database", first use `/gruntwork:find` to identify the right module (e.g., `terraform-aws-service-catalog/rds`).

2. Call `get_module_variables` with `required_only: true` to get the variables that MUST be set.

3. Call `get_module_variables` without `required_only` to understand all available configuration options.

4. Call `get_example` with `type: "production"` to see the canonical Terragrunt usage pattern. This shows the correct `source`, `dependency`, and `inputs` structure.

5. Call `find_related_modules` with `relationship: "depends_on"` to identify dependencies (e.g., RDS depends on VPC).

6. Read the customer's existing repo structure and match their naming/layout conventions:
   - `root.hcl` at the repo root — for `remote_state` and provider generation
   - `common.hcl` — for org-wide values like `name_prefix`, `account_ids`
   - `account.hcl` — for `account_name`, `account_role`
   - `region.hcl` — for `aws_region`
   - Existing unit directories — mirror their `{account}/{region}/{category}/{module}/` layout exactly
   - Any `terragrunt.stack.hcl` files — if the repo already uses explicit stacks, a new unit
     may belong as a `unit "..." { ... }` block inside an existing stack file rather than as
     a standalone `terragrunt.hcl`. See "Explicit stacks" below.

7. Generate a single Terragrunt unit file at `{account}/{region}/{category}/{module}/terragrunt.hcl`:

   ```hcl
   include "root" {
     path = find_in_parent_folders("root.hcl")
   }

   locals {
     common_vars  = read_terragrunt_config(find_in_parent_folders("common.hcl"))
     account_vars = read_terragrunt_config(find_in_parent_folders("account.hcl"))
     region_vars  = read_terragrunt_config(find_in_parent_folders("region.hcl"))
   }

   terraform {
     source = "git::git@github.com:gruntwork-io/{repo}.git//modules/{category}/{module}?ref={version}"
   }

   dependency "vpc" {
     config_path  = "${get_terragrunt_dir()}/../../networking/vpc"
     mock_outputs = { vpc_id = "vpc-mock", private_subnet_ids = ["subnet-mock"] }
   }

   inputs = {
     # Required variables from step 2, then environment-specific values
     # pulled from locals above (e.g. name_prefix = local.common_vars.locals.name_prefix)
   }
   ```

8. After generating, suggest running `terragrunt validate` to check the config.

## Explicit stacks (higher-order infrastructure patterns)

If the pattern the user wants to deploy is **a bundle of units** — e.g. "a production web service with its own VPC, ALB, ECS cluster, and RDS", or "a standard networking layer: VPC + NAT + VPC endpoints + flow logs" — reach for an explicit Terragrunt stack (`terragrunt.stack.hcl`) instead of hand-scaffolding each unit separately. Stacks let you declare a multi-unit pattern in one file, then instantiate it wherever you need it (per-env, per-region, per-account) with just a few values changed. They are the primary mechanism in Terragrunt for building **reusable higher-order patterns**.

### When to reach for a stack

Prefer a stack when any of these apply:

- The pattern includes **3+ units that are always deployed together**
- The same bundle will be **instantiated in multiple places** with the same shape (different env, region, or account)
- The repo already has `terragrunt.stack.hcl` files — the new unit likely belongs inside one

Prefer the single-unit flow above when the target is one module or a one-off deployment.

### Scaffolding a new stack

1. Call `get_terragrunt_guidance` with `topic: "stacks"` to pull the current `unit` / `stack` / `values` syntax directly from the Terragrunt docs — Stacks is an actively evolving feature, so don't rely on memorized syntax.

2. Place the stack at `{account}/{region}/{pattern-name}/terragrunt.stack.hcl`. Declare one `unit "..." { ... }` per Gruntwork module the pattern needs, giving each a `source`, a relative `path` (where the unit will be generated), and the `values` it should receive as inputs.

3. Express inter-unit dependencies (e.g. the ALB unit needing the VPC's outputs) via `dependency` blocks inside each generated unit's `terragrunt.hcl`, not at the stack-file level. The stack file only declares *what* units exist and *what values* they get; wiring happens at the unit layer.

4. Generate and apply:

   ```bash
   terragrunt stack generate   # materializes .terragrunt-stack/ with one dir per unit
   terragrunt stack run apply  # applies all units in dependency order
   ```

   `.terragrunt-stack/` is regenerated on each `generate` and **must not be committed** — add it to `.gitignore`. Commit only the `terragrunt.stack.hcl` itself.

### Turning a stack into a versioned reusable pattern

Once the pattern has stabilized, extract it into its own directory (or its own git repo) and reference it from smaller caller stacks:

```hcl
# Caller: {account}/{region}/web/terragrunt.stack.hcl
stack "web_service" {
  source = "git::git@github.com:acme/tg-stacks.git//web-service?ref=v1.0.0"
  path   = "."
  values = {
    service_name = "checkout"
    cidr_block   = "10.1.0.0/16"
  }
}
```

Every env, account, or region that wants this pattern then has a tiny caller stack that consumes the versioned upstream. Rolling out an update = bump `ref=` on each caller.

### Adding to an existing stack

If step 6 turned up a `terragrunt.stack.hcl` where this unit belongs, **extend that file** — add a new `unit "..." { ... }` block rather than scaffolding a standalone `terragrunt.hcl`. Put the source URL and required inputs in `values`, and rely on the generated unit's `dependency` block for any inter-unit wiring.

## Important

- Always use `git::git@github.com:gruntwork-io/{repo}.git//modules/{path}?ref={version}` for the source URL
- Always include `mock_outputs` in `dependency` blocks for plan-time safety
- Use `read_terragrunt_config(find_in_parent_folders(...))` for hierarchical config, not hardcoded values
- Match the customer's existing directory structure and naming conventions exactly
- If the repo uses explicit stacks (`terragrunt.stack.hcl` exists), **extend the existing stack** with a new `unit {}` block rather than scaffolding a standalone `terragrunt.hcl` — stacks and loose units in the same pattern create drift and confusion
- For anything that's inherently a multi-unit bundle (service + its deps, network layer, account baseline), reach for `terragrunt.stack.hcl` — don't hand-scaffold 5 separate units when one stack file captures the pattern
- Never commit the generated `.terragrunt-stack/` directory; ensure it's in `.gitignore`
- Say "Terragrunt, OpenTofu/Terraform" (Terragrunt first)
