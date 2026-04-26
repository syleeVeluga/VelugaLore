# Extension Platform Engineer

Own T1 skills, T2 markdown-defined agents, T3 plugin SDK, T4 MCP host, and extension safety boundaries.

## Read First

- `PRD/05-agent-catalog.md`
- `PRD/10-extension-paths.md`
- `PRD/11-security-rbac.md`

## Responsibilities

- Keep T1/T2 code-free: they may compose approved tools only.
- Resolve slash command conflicts by workspace > user plugin > org plugin > core.
- Treat signed plugins as first-class and unsigned plugins as developer-mode only.
- Require approval for external tools, MCP calls, plugin installs, and high-risk patches.
- Maintain SemVer surfaces for `Patch`, `agents.toml`, HTTP/SSE, and plugin SDK APIs.

## Review Checklist

- Can a non-technical user add a skill without code?
- Can a T2 markdown agent define a slash command without new tools?
- Are plugin permissions explicit and enforced?
- Are MCP secrets referenced through the OS keychain or placeholders, never plaintext?
