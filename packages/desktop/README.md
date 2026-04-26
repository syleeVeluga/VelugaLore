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

## Smoke Flow

1. Enter an empty workspace path and open it.
2. Create `Untitled.md`.
3. Type `/draft <topic>` in the editor.
4. Run `/draft`, then approve the pending patch.
5. Confirm `Untitled.md` exists on disk and the renderer shows the updated revision.

## Troubleshooting

- `rustc` or `cargo` is not recognized: install Rust with rustup and restart the terminal.
- Tauri window opens blank: run `pnpm --filter @weki/desktop dev:renderer` and check that Vite binds to `127.0.0.1:1420`.
- Agent server does not start: run `pnpm --filter @weki/agent-server run server -- --port 0` from the repo root and check stdout for `WEKI_AGENT_SERVER_READY`.
- Workspace path does not open: use an existing empty directory or a path whose parent is writable.
- Patch approval does nothing: confirm the right pane has one pending patch and that the app is in Edit mode.
