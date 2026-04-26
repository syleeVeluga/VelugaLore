# Security Approval Check Subagent

Use this for approval policy, RBAC, external tool, plugin, and secret-handling review.

## Check

- No code path bypasses approval queue for IA ops, import, external tools, MCP, or plugin installs.
- AGENTS.md approval policies can strengthen but not weaken hard defaults.
- RBAC matrix from `PRD/11-security-rbac.md` is enforced at API and DB levels.
- Secrets are stored in OS keychain or server-side secure storage, never plaintext config.
- Body secret detection masks and warns before persistence.
- External tool arguments and results are redacted in traces and audit logs.
- Unsigned plugins require developer mode and explicit permissions.

## Output

Findings first, ordered by exploitability and data-loss risk. Include the exact PRD guardrail violated.
