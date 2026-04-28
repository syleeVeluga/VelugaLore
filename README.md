# VelugaLore

PRD-first implementation workspace for VelugaLore.

## Current Slice

- Slice: `S-09a IngestAgent and import system operation`
- PRD: `PRD/05-agent-catalog.md`, `PRD/08-data-model.md`, `PRD/13-implementation-guide.md`, `PRD/15-acceptance-criteria.md`
- Goal: open the ingest/import loop by routing `ingest` through the Python worker contract, preserving immutable raw provenance, measuring docx/md import fidelity, and grouping imports in rollbackable `import_runs`.

## Previous Slice Snapshot

`S-08.6 Real LLM provider runtime` is implemented at the contract/runtime boundary for `draft`, `improve`, and `ask`: normal runtime preflights `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `GOOGLE_API_KEY`, delegates to `agent-runtime-py`, and records provider/model metadata when the worker returns it. The remaining proof is still manual/live: a Gemini `/draft` run through desktop approval, 2-phase write, and disk confirmation with real provider keys.

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

Verified locally for S-09a:

- `powershell -ExecutionPolicy Bypass -File tools/agent-harness.ps1 -Command validate`
- `powershell -ExecutionPolicy Bypass -File tools/agent-harness.ps1 -Command brief -Slice S-09a`
- `corepack pnpm lint:deps`
- `corepack pnpm --filter @weki/core test`
- `corepack pnpm --filter @weki/db test`
- `corepack pnpm --filter @weki/agent-server test`
- `corepack pnpm test`
- `corepack pnpm build`
- `python -m unittest discover tests` from `packages/agent-runtime-py` with `PYTHONPATH=src`

Previously verified for the desktop runtime snapshot:

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
