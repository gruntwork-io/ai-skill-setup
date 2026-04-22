---
name: gruntwork-deploy
description: Scaffold Terragrunt configs for a Gruntwork module
---

# Module Integration

When the user wants to deploy a Gruntwork module into their infrastructure-live repo, generate the complete Terragrunt configuration.

## Steps

1. Identify the target module. If the user says "I need an RDS database", first use `/gruntwork-find` to identify the right module (e.g., `terraform-aws-service-catalog/rds`).

2. Call `get_module_variables` with `required_only: true` to get the variables that MUST be set.

3. Call `get_module_variables` without `required_only` to understand all available configuration options.

4. Call `get_example` with `type: "production"` to see the canonical Terragrunt usage pattern. This shows the correct `source`, `dependency`, and `inputs` structure.

5. Call `get_terragrunt_guidance` with `topic: "includes"` to understand the `_envcommon` pattern.

6. Call `find_related_modules` with `relationship: "depends_on"` to identify dependencies (e.g., RDS depends on VPC).

7. Read the customer's existing repo structure:
   - `common.hcl` — for `name_prefix`, `account_ids`
   - `account.hcl` — for `account_name`, `account_role`
   - `region.hcl` — for `aws_region`
   - Existing `_envcommon/` files — match their naming conventions and patterns

8. Generate two files:

   **`_envcommon/{category}/{module}.hcl`** (base config):
   ```hcl
   terraform {
     source = "${get_parent_terragrunt_dir()}/../../../../..//modules/{category}/{module}"
   }

   locals {
     common_vars  = read_terragrunt_config(find_in_parent_folders("common.hcl"))
     account_vars = read_terragrunt_config(find_in_parent_folders("account.hcl"))
     region_vars  = read_terragrunt_config(find_in_parent_folders("region.hcl"))
   }

   dependency "vpc" {
     config_path = "${get_terragrunt_dir()}/../networking/vpc"
     mock_outputs = { vpc_id = "vpc-mock", ... }
   }

   inputs = {
     # Required variables with sensible defaults
   }
   ```

   **`{env}/{region}/{category}/{module}/terragrunt.hcl`** (env override):
   ```hcl
   include "root" {
     path = find_in_parent_folders("root.hcl")
   }

   include "envcommon" {
     path = "${dirname(find_in_parent_folders("root.hcl"))}/_envcommon/{category}/{module}.hcl"
   }

   inputs = {
     # Environment-specific overrides only
   }
   ```

9. After generating, suggest running `terragrunt validate` to check the config.

## Important

- Always use `git::git@github.com:gruntwork-io/{repo}.git//modules/{path}?ref={version}` for the source URL
- Always include `mock_outputs` in `dependency` blocks for plan-time safety
- Use `read_terragrunt_config(find_in_parent_folders(...))` for hierarchical config, not hardcoded values
- Match the customer's existing directory structure and naming conventions exactly
- If the customer doesn't have an `_envcommon` pattern, generate flat configs instead
- Say "Terragrunt, OpenTofu/Terraform" (Terragrunt first)
