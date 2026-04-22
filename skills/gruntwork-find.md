---
name: gruntwork-find
description: Find Gruntwork modules for an infrastructure requirement
---

# Module Discovery

When the user describes an infrastructure need, find the right Gruntwork module(s).

## Steps

1. Call `search_modules` with relevant keywords from the user's request. Filter by `cloud` if they mention a specific provider (AWS, GCP, Kubernetes).

2. Call `semantic_search` with the user's full question and `content_type` filter set to `readme` or `core-concepts` to find conceptually relevant modules beyond keyword matching.

3. For the top 3 candidates, call `get_module_variables` with `required_only: true` to understand the configuration surface area.

4. Scan the customer's existing codebase for `source` URLs in `terragrunt.hcl` files to identify which Gruntwork modules they already use. Note these to avoid recommending duplicates.

5. Present a comparison table:

   | Module | Description | Required Variables | Cloud |
   |--------|-------------|-------------------|-------|

   Highlight which modules the customer already uses vs. new recommendations.

6. For the recommended module, call `get_example` to show a working example.

7. If the user asks "how do I wire this up in Terragrunt?", call `get_terragrunt_guidance` with the relevant topic (e.g., `dependency`, `includes`) to provide correct Terragrunt syntax.

## Important

- Always say "Terragrunt, OpenTofu/Terraform" (Terragrunt first)
- If no modules match, call `check_support` to explicitly tell the user whether the capability is supported
- If the user asks about Azure, Oracle, or other unsupported clouds, tell them clearly: "Gruntwork covers AWS, GCP, and Kubernetes"
- When recommending modules the customer may not have purchased, note: "Contact Gruntwork support if you need access to this module"
