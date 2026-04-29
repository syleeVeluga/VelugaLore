# @weki/desktop

S-08.5 desktop shell catch-up package.

## Prerequisites

- Node.js 20.11+ and pnpm 10+
- Rust stable with `cargo` and `rustc` on `PATH`
- Windows: WebView2 Runtime
- macOS: Xcode Command Line Tools
- Linux: WebKitGTK/libsoup packages required by Tauri 2

## Dev Run

```powershell
pnpm install
pnpm --filter @weki/desktop dev
```

The Tauri shell starts Vite on `127.0.0.1:1420`. Opening a workspace creates `.weki/`, starts `@weki/agent-server` as a subprocess, and exposes the PRD §13.7.4 IPC commands.

## Smoke Flow (PRD §13.7.3)

The 9-step user flow below must pass once by hand for S-08.5 acceptance. The data path is already covered by the tracer test in [src/desktop-session.test.ts](src/desktop-session.test.ts) (`walks the PRD §13.7.3 nine-step /draft tracer in a single session`); this checklist is for the GUI experience — slash menu UX, the `Cmd/Ctrl+Enter` approval shortcut, paint flicker, and tree update timing.

| # | Action | Expected | Pass |
|---|---|---|---|
| 1 | `pnpm --filter @weki/desktop dev` | Tauri window opens (loading splash allowed) | ☐ |
| 2 | Open Workspace → pick an empty directory | `.weki/` is created and `agent-server` subprocess starts | ☐ |
| 3 | Left tree shows empty state → New Note | `Untitled.md` appears (rev=1, body="") | ☐ |
| 4 | Editor opens `Untitled.md` | Cursor can be placed in the body | ☐ |
| 5 | Type `/`, pick `/draft`, enter an argument (e.g. "근태 관리 규정 초안") | Slash menu (S-04) renders; argument accepted | ☐ |
| 6 | Submit `/draft` | Right pane shows agent_run progress (SSE); completes with a patch preview (S-07) | ☐ |
| 7 | Press `Cmd/Ctrl+Enter` to approve | Patch approved; 2-phase write (S-03) runs; `Untitled.md` is written to disk | ☐ |
| 8 | Watch editor and left tree | Editor shows new rev=2; tree marks the file as changed (●) | ☐ |
| 9 | Open the same `.md` in an external editor, edit, save | External edit propagates to the renderer within ~5s via the S-03 watcher (`doc_changed`) | ☐ |

## Live LLM Smoke (S-08.6)

The 9-step table above closes the S-08.5 desktop shell gate using deterministic agent output. S-08.6 adds the **real LLM provider runtime** gate: the same flow must pass once with the three production provider keys set, and the patch preview at step 6 must contain real Gemini-generated text — not the deterministic scaffold body.

### Prerequisites

Set the three keys in the **same PowerShell session** that launches the desktop. Do not write them to a `.env` on disk for this slice — PRD §11.5.1 reserves a desktop OS-keychain UX for a follow-up slice; S-08.6 only closes the env-var preflight path.

```powershell
$env:OPENAI_API_KEY    = "sk-..."
$env:ANTHROPIC_API_KEY = "sk-ant-..."
$env:GOOGLE_API_KEY    = "AIza..."
$env:WEKI_AGENT_RUNTIME = $null   # must be unset; "test" suppresses live providers
pnpm --filter @weki/desktop dev
```

### Sign-off table

| # | Action | Expected | Pass |
|---|---|---|---|
| 1 | Launch desktop with all three keys set | Tauri window opens; agent-server log shows no `PROVIDER_KEY_MISSING` | ☐ |
| 2 | Run the 9-step `/draft` smoke from the table above | Step 6 patch preview body is Gemini-generated prose, not the deterministic scaffold | ☐ |
| 3 | Approve the patch (`Cmd/Ctrl+Enter`) and inspect the saved `.md` on disk | File body matches the approved Gemini output; `body_sha256` consistent | ☐ |
| 4 | (Optional) Unset one key and rerun `/draft` | Run fails fast with `PROVIDER_KEY_MISSING` and names the missing key | ☐ |
| 5 | (Optional) Inspect `agent_runs` row for the live run | Row records `model` (e.g. `google-gla:gemini-2.5-flash-lite`) and `cost_tokens` when the worker returns usage | ☐ |

### Why dev mode is the canonical path

PRD §13.7.5 fixes "본 슬라이스에서는 로컬 dev 빌드만 보장" — `pnpm --filter @weki/desktop dev` is the path the slice DoD covers. The `target/release/weki-desktop.exe` produced by `pnpm --filter @weki/desktop tauri build` works for ad-hoc verification but its `agent-server` sidecar wiring is not exercised by automated tests in this slice.

## Troubleshooting

- `rustc` or `cargo` is not recognized: install Rust with rustup and restart the terminal.
- Tauri window opens blank: run `pnpm --filter @weki/desktop dev:renderer` and check that Vite binds to `127.0.0.1:1420`.
- Agent server does not start: run `pnpm --filter @weki/agent-server run server -- --port 0` from the repo root and check stdout for `WEKI_AGENT_SERVER_READY`.
- Workspace path does not open: use an existing empty directory or a path whose parent is writable.
- Patch approval does nothing: confirm the right pane has one pending patch and that the app is in Edit mode.
- `/draft` errors with `PROVIDER_KEY_MISSING`: set `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `GOOGLE_API_KEY` in the same PowerShell session before launching, and confirm `WEKI_AGENT_RUNTIME` is unset.
