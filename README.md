# WekiDocs

PRD-first implementation workspace for WekiDocs.

## Current Slice

- Slice: `S-03 Local workspace FS watcher and 2-phase write`
- PRD: `PRD/08-data-model.md`, `PRD/11-security-rbac.md`, `PRD/15-acceptance-criteria.md`
- Goal: keep Postgres-backed document rows and local markdown mirrors consistent through atomic writes and external edit reconciliation.

## Bootstrap

```powershell
pnpm install
pnpm lint:deps
pnpm build
powershell -ExecutionPolicy Bypass -File tools/agent-harness.ps1 -Command validate
```
