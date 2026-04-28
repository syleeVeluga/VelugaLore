# Slice Workflow

Load this when selecting, planning, or handing off a VelugaLore implementation slice.

## Select

1. Run `tools/agent-harness.ps1 -Command list`.
2. Prefer the next unimplemented slice in PRD order.
3. Run `tools/agent-harness.ps1 -Command brief -Slice <S-ID>`.
4. Use the primary agents listed by the brief.

## Plan

For each slice, capture:

- PRD sections read.
- Package/file surfaces expected to change.
- Data contracts or schemas affected.
- Tests, evals, or visual checks required.
- Acceptance criteria targeted.

Avoid broad refactors unless they are necessary for the active slice.

## Implement

- Start with shared contracts in `packages/core` when the slice creates a cross-package API.
- Follow with persistence/runtime implementation.
- Add UI only when the slice requires a user-visible path.
- Add tests and evals before expanding behavior beyond the PRD brief.

## Verify

- Run `tools/agent-harness.ps1 -Command validate`.
- Run the package tests named by the slice or newly created scripts.
- For frontend slices, verify keyboard flow and responsive layout.
- For DB/search slices, include migration/RLS tests and representative query checks.

## Handoff Template

```text
Slice: S-XX
PRD: PRD/...
Changed: ...
Verified: ...
Unproven: ...
Notes: ...
```
