---
name: weki-slice-builder
description: Use when implementing, planning, reviewing, or validating VelugaLore PRD slices; scaffolding the TypeScript/Tauri/Postgres/pydantic-ai monorepo; adding core agents, slash commands, extension tiers, evals, approval queue, RBAC, or project development-agent assets; or checking work against VelugaLore PRD guardrails.
---

# Weki Slice Builder

Use this skill to turn the VelugaLore PRD into one safe, traceable implementation slice.

## Quick Start

1. Find the repository root containing `PRD/` and `AGENTS.md`.
2. Run the harness:

   ```powershell
   powershell -ExecutionPolicy Bypass -File tools/agent-harness.ps1 -Command validate
   powershell -ExecutionPolicy Bypass -File tools/agent-harness.ps1 -Command list
   powershell -ExecutionPolicy Bypass -File tools/agent-harness.ps1 -Command brief -Slice S-01
   ```

3. Read `AGENTS.md`, the slice brief, and only the PRD sections named by the brief.
4. Implement one vertical slice. Do not start unrelated slices unless the user explicitly asks.
5. Before handoff, rerun `tools/agent-harness.ps1 -Command validate` and the slice-specific tests.

You can also invoke the bundled helper:

```powershell
powershell -ExecutionPolicy Bypass -File .codex/skills/weki-slice-builder/scripts/invoke-harness.ps1 -Command brief -Slice S-01
```

## Reference Loading

- Read `references/project-guardrails.md` when touching architecture, data, security, agents, extensions, or approvals.
- Read `references/slice-workflow.md` when choosing a slice, preparing a work plan, or writing a final handoff.

Keep these references out of context unless they are relevant to the current slice.

## Implementation Rules

- Preserve PRD decisions D1-D13 unless the user asks to revise the PRD.
- Keep every PR/patch tied to a slice ID from `.agents/harness/slices.json`.
- Use `Patch` or `ReadOnlyAnswer` as the only agent output contracts.
- Treat `/curate`, `/import`, external tools, MCP calls, and plugin installs as approval-gated.
- Add or update tests/evals with behavior changes. Agent changes need pydantic output validation and golden cases.
- Prefer the role prompt in `.agents/roles/` that matches the active slice.

## Handoff

Include the slice ID, PRD sections used, files changed, tests run, and residual acceptance criteria that remain unproven.
