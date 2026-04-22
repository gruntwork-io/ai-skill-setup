---
name: gruntwork:patcher
description: Audit module versions and apply patches/upgrades
---

# Patching & Version Management

AI interface to Gruntwork Patcher. Two modes: audit (read-only) and upgrade (write).

## Audit Mode

When the user asks "what modules am I using?", "are my modules up to date?", or "what patches are available?":

1. Scan all `terragrunt.hcl` files in the repo for `source` URLs matching `gruntwork-io/{repo}.git//modules/{path}?ref={version}`.

2. Extract the repo name and version for each module.

3. Call `list_repos` to get the latest version for each repo in the Gruntwork library.

4. Compare: for each module, show current version vs latest version.

5. Call `get_patcher_info` for repos that have patches available between the customer's version and the latest.

6. Generate a markdown report:

   ```markdown
   # Module Version Audit

   ## Version Status
   | Module | Current | Latest | Status |
   |--------|---------|--------|--------|
   | terraform-aws-vpc/vpc-app | v0.22.0 | v0.26.24 | ⚠️ outdated |
   | terraform-aws-eks/eks-cluster | v0.67.0 | v0.67.0 | ✅ current |

   ## Available Patches
   - terraform-aws-service-catalog v0.80.0 → v0.96.4: 5 patches
     - v0.80.0: base/ec2-baseline, services/ec2-instance
     - v0.82.0: networking/vpc, networking/vpc-mgmt
     - ...

   ## Recommended Modules
   Based on your current stack, consider adding:
   - `vpc-flow-logs` — you use `vpc-app` but not flow logs (compliance)
   - `guardduty` — security monitoring
   ```

## Upgrade Mode

When the user asks "upgrade module X" or "apply patches":

1. Identify the module and current version from the `source` URL.

2. Call `get_patcher_info` with `from_version` (current) and `to_version` (target or latest).

3. Read `.patcher/config.yaml` — versions are listed sequentially.

4. For each version in the chain between current and target:
   - Filter patches to those whose `modules_affected` includes the customer's module
   - Read the `patch.yaml` to get the steps

5. Apply patches in version order:
   - For `terrapatch` steps: invoke via bash if `patcher-cli` is installed
   - If `patcher-cli` not installed: output the manual steps for the user to run

6. After patches applied, update the `source` URL's `?ref=` tag to the target version.

7. Call `get_module_variables` for both old and new versions. Diff them:
   - New required variables → flag, suggest values
   - Removed variables → flag, user must remove from inputs
   - Renamed variables → suggest the rename

8. Generate a PR-ready summary:
   ```markdown
   ## Upgrade Summary
   - **Module**: terraform-aws-service-catalog/vpc
   - **Version**: v0.80.0 → v0.96.4
   - **Patches applied**: 5
   - **Variables added**: `use_managed_iam_policies` (default: false)
   - **Variables removed**: none
   - **Files modified**: 3
   ```

## Important

- Always show the current state before making changes
- In audit mode, never modify files
- In upgrade mode, always generate a summary suitable for a PR description
- If `patcher-cli` is not installed, output manual steps instead of failing
- Say "Terragrunt, OpenTofu/Terraform" (Terragrunt first)
