# WekiDocs

PRD-first implementation workspace for WekiDocs.

## Current Slice

- Slice: `S-08.5 Desktop shell catch-up: first runnable desktop build`
- PRD: `PRD/04-architecture.md`, `PRD/07-editor-ui.md`, `PRD/09-code-layout.md`, `PRD/13-implementation-guide.md`, `PRD/14-milestones.md`
- Goal: provide a first runnable Tauri desktop shell with a React renderer, workspace opening, agent-server subprocess startup, and the approval-first `/draft` smoke path.

## Desktop Developer Build

The Windows developer test executable can currently be produced with:

```powershell
pnpm --filter @weki/desktop exec tauri build
```

Current verified output path:

```text
packages/desktop/src-tauri/target/release/weki-desktop.exe
```

This is a standalone release executable for developer testing, not an installer. Tauri bundling is intentionally disabled in `packages/desktop/src-tauri/tauri.conf.json` with `"bundle": { "active": false }`, so MSI/NSIS artifacts are not produced yet.

## LLM Provider Keys

Current S-08.5 builds do not require OpenAI, Anthropic, or Gemini keys to launch. The current `@weki/agent-server` agents are local deterministic implementations used to exercise the Patch/ReadOnlyAnswer contracts and approval flow; they do not call external LLM providers yet.

PRD decision D13 still stands for v1 GA: OpenAI, Anthropic, and Gemini are the first-class LLM providers, with OpenAI embeddings first. The intended workspace model selection shape is:

```toml
# workspace/.weki/config.toml

[llm.default]
provider = "anthropic" # openai | anthropic | gemini
model = "claude-sonnet-4-6"

[llm.fallback]
provider = "openai"
model = "gpt-4o-mini"

[agent.draft]
provider = "openai"
model = "gpt-4o-mini"

[embedding]
provider = "openai"
model = "text-embedding-3-small"
dimensions = 1536
```

For local development after the pydantic-ai provider integration lands, use process-level secrets only in your shell or OS secret store:

```powershell
$env:OPENAI_API_KEY = "..."
$env:ANTHROPIC_API_KEY = "..."
$env:GEMINI_API_KEY = "..."
```

Do not commit `.env` files or workspace config files containing API keys. Per `PRD/11-security-rbac.md`, desktop API keys should ultimately be stored in the OS keychain: Windows Credential Manager, macOS Keychain, or libsecret.

Verified locally:

- `powershell -ExecutionPolicy Bypass -File tools/agent-harness.ps1 -Command validate`
- `pnpm --filter @weki/desktop build`
- `pnpm --filter @weki/desktop exec tauri build`
- `pnpm --filter @weki/desktop test`
- `pnpm lint:deps`
- `pnpm --filter @weki/desktop exec tauri info`

Still requiring manual smoke verification for S-08.5:

- End-to-end `/draft` flow from slash command to approved patch on disk.
- Two-phase write parity after approval, including matching `body_sha256`.
- External markdown edits propagating to the renderer through the S-03 watcher within five seconds.

## Bootstrap

```powershell
pnpm install
pnpm lint:deps
pnpm build
powershell -ExecutionPolicy Bypass -File tools/agent-harness.ps1 -Command validate
# Linux/macOS/CI:
pwsh -File tools/agent-harness.ps1 -Command validate
```
