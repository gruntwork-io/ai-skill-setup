---
name: gruntwork-debug
description: Troubleshoot Terragrunt, OpenTofu/Terraform errors
---

# Troubleshooting

When the user shares an error message or describes unexpected behavior with Gruntwork modules:

## Steps

1. Read the error message carefully. Identify:
   - Which module is involved (from the file path or source URL)
   - The error type (plan error, apply error, provider error, Terragrunt error)
   - Any version numbers mentioned

2. Call `semantic_search` with the error message as the query, filtering to `content_type` of `core-concepts`, `readme`, or `patch`. This searches the Gruntwork documentation for known issues, gotchas, and solutions.

3. If a specific module is identified, call `get_module` to check its metadata and `get_module_variables` to verify the user's variable values are within expected ranges.

4. Call `get_terragrunt_guidance` if the error is Terragrunt-specific (dependency cycles, missing parent config, include errors).

5. Check common error patterns:

   **"VpcLimitExceeded"**: Suggest checking AWS VPC limits and the `request-quota-increase` module.

   **"Invalid count argument"**: Often caused by a variable that resolves to null at plan time. Check `mock_outputs` in dependency blocks.

   **Provider version constraint**: Check `.terraform.lock.hcl` for version conflicts. Call `get_patcher_info` to see if a patch addresses this.

   **"Could not find parent terragrunt.hcl"**: Directory structure issue. The `find_in_parent_folders()` call can't locate the root config. Check the directory hierarchy.

   **"Cycle detected"**: Terragrunt dependency graph has a circular reference. Map out the `dependency {}` blocks and find the cycle.

   **"Error: Unsupported attribute"**: Variable was removed or renamed in a module upgrade. Call `get_module_variables` for the current version and compare with the user's inputs.

   **State lock errors**: Another process is running, or a previous run crashed without releasing the lock.

6. If the error relates to a version upgrade, check if patches exist:
   - Call `get_patcher_info` with the repo name
   - Look for patches between the old and new version that address the error

7. Provide a clear diagnosis:
   - What the error means
   - Why it's happening
   - How to fix it (specific steps)
   - If it's a known Gruntwork issue, link to the relevant docs

## Important

- Read the actual failing files before diagnosing — don't guess
- Check `.terraform.lock.hcl` for provider version constraints
- If the error is about a module the customer may not own, note: "Contact Gruntwork support for access"
- Say "Terragrunt, OpenTofu/Terraform" (Terragrunt first)
- When suggesting variable changes, show the exact `inputs` block diff
