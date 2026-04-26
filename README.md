# WekiDocs

PRD-first implementation workspace for WekiDocs.

## Current Slice

- Slice: `S-01 Monorepo bootstrap`
- PRD: `PRD/09-code-layout.md`, `PRD/13-implementation-guide.md`, `PRD/14-milestones.md`
- Goal: establish the pnpm/turbo monorepo, package boundaries, and initial CI gate.

## Bootstrap

```powershell
pnpm install
pnpm lint:deps
pnpm build
powershell -ExecutionPolicy Bypass -File tools/agent-harness.ps1 -Command validate
```
