# VelugaLore

PRD-first implementation workspace for VelugaLore.

## Current Slice

- Slice: `S-08.6 Real LLM provider runtime`
- PRD: `PRD/04-architecture.md`, `PRD/05-agent-catalog.md`, `PRD/11-security-rbac.md`, `PRD/12-observability.md`, `PRD/13-implementation-guide.md`, `PRD/15-acceptance-criteria.md`, `PRD/18-implementation-handoffs.md`
- Goal: make the AI-agent runtime real by routing core agents through pydantic-ai and the required OpenAI, Anthropic, and Google Gemini provider keys.

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

Normal VelugaLore development/runtime requires all three first-class provider keys before agent-server starts core agents:

```powershell
$env:OPENAI_API_KEY = "..."
$env:ANTHROPIC_API_KEY = "..."
$env:GOOGLE_API_KEY = "..."
```

The earlier contract-only agent implementations are scaffolding for tests and must not be the default product runtime. S-08.6 wires `@weki/agent-server` to `agent-runtime-py` and pydantic-ai so `/draft`, `/improve`, and `/ask` exercise live provider calls while still returning validated `Patch` or `ReadOnlyAnswer` contracts.

PRD decision D13: OpenAI, Anthropic, and Google Gemini are first-class LLM providers, Gemini is the default chat provider, and OpenAI embeddings remain first. The intended workspace model selection shape is:

```toml
# workspace/.weki/config.toml

[providers.required]
openai = true
anthropic = true
google = true

[llm.default]
provider = "google-gla"
model = "gemini-2.5-flash-lite"

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

Do not commit `.env` files or workspace config files containing API keys. Per `PRD/11-security-rbac.md`, desktop API keys should ultimately be stored in the OS keychain: Windows Credential Manager, macOS Keychain, or libsecret.

Verified locally:

- `powershell -ExecutionPolicy Bypass -File tools/agent-harness.ps1 -Command validate`
- `pnpm --filter @weki/desktop build`
- `pnpm --filter @weki/desktop exec tauri build`
- `pnpm --filter @weki/desktop test`
- `pnpm lint:deps`
- `pnpm --filter @weki/desktop exec tauri info`

Still requiring manual smoke verification for S-08.5/S-08.6:

- End-to-end live-LLM `/draft` flow from slash command to approved patch on disk.
- Three-provider preflight for `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `GOOGLE_API_KEY`.
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
