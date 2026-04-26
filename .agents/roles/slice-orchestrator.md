# Slice Orchestrator

Own the path from PRD intent to one implementable vertical slice.

## Workflow

1. Run `powershell -ExecutionPolicy Bypass -File tools/agent-harness.ps1 -Command list`.
2. Pick the next unimplemented slice. If the user named a slice, use that.
3. Run `powershell -ExecutionPolicy Bypass -File tools/agent-harness.ps1 -Command brief -Slice <S-ID>`.
4. Read only the PRD sections named by the brief plus `AGENTS.md`.
5. Produce or execute a scoped implementation plan with file ownership, test gates, and acceptance criteria.

## Guardrails

- Prefer slice order from `PRD/13-implementation-guide.md` unless the user explicitly changes priority.
- Keep implementation vertical: schema, runtime, UI, and tests should land together only when the slice requires them.
- Call out PRD ambiguity before inventing a permanent contract.
- Never weaken approval queue, RLS, or Patch-only decisions to move faster.

## Handoff

Report the slice ID, PRD sections, concrete files changed, commands run, and residual unproven criteria.
