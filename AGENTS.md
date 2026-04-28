# VelugaLore Development Agent Guide

이 저장소는 아직 제품 코드보다 PRD가 먼저 있는 구현 준비 단계다. 모든 개발 에이전트는 PRD를 실행 계획으로 취급하고, 한 번에 하나의 vertical slice만 구현한다.

## First Read

1. `PRD/00-onepager.md` for product intent and decisions.
2. `PRD/13-implementation-guide.md` for slice order and DoD.
3. The PRD sections referenced by the selected slice in `.agents/harness/slices.json`.
4. The relevant role prompt under `.agents/roles/` and, if needed, a focused prompt under `.agents/subagents/`.

Before implementation, run:

```powershell
powershell -ExecutionPolicy Bypass -File tools/agent-harness.ps1 -Command validate
powershell -ExecutionPolicy Bypass -File tools/agent-harness.ps1 -Command brief -Slice S-01
```

Replace `S-01` with the slice being implemented.

## Non-Negotiable Product Decisions

- Postgres is the source of truth. Markdown files are mirrors, synchronized by the 2-phase write path in `PRD/11-security-rbac.md`.
- Agent outputs are always `Patch` or `ReadOnlyAnswer`; agents do not directly mutate document bodies.
- `/curate` can propose information-architecture ops only and must never edit prose text.
- Approval-first automation is intentional. IA changes, imports, external tools, MCP calls, and plugin installs must pass the approval queue described in `PRD/11-security-rbac.md`.
- opencode is a pattern reference, not a product dependency. Do not vendor or copy opencode code unless a future task explicitly reopens that decision.
- Core agents are exactly `draft`, `improve`, `ask`, `ingest`, and `curate` for v1. Other agents are extensions.
- T1/T2 extensions must be code-free composition of approved tools. New tools belong in T3 plugins.
- Every user-visible string must be prepared for ko/en i18n.

## Architecture Shape

The intended monorepo is described in `PRD/09-code-layout.md`:

- `packages/core`: shared schemas, patch logic, slash parser. Keep runtime deps near zero.
- `packages/db`: drizzle schema, migrations, SQL helpers, pgvector/pg_trgm.
- `packages/desktop`: Tauri shell and renderer bridge.
- `packages/web`: Next.js web mirror.
- `packages/editor`: CodeMirror 6 + ProseMirror bridge.
- `packages/agent-server`: HTTP/SSE daemon, session/run manager, MCP host.
- `packages/agent-runtime-py`: pydantic-ai workers and evals.
- `packages/markdown-lsp`: markdown diagnostics.
- `packages/plugin-sdk`: public extension API.
- `packages/cli`: `weki` command.

When this layout does not exist yet, start with S-01 and scaffold only what that slice needs.

## Slice Discipline

- Choose the next slice from `PRD/13-implementation-guide.md` and `.agents/harness/slices.json`.
- Implement user-visible value, not horizontal infrastructure by itself.
- Keep PRD traceability in commits/PRs: slice ID, referenced sections, affected acceptance criteria.
- For schema or PatchOp changes, update TS types, Python models, migrations, tests, and docs together.
- For agent behavior changes, add or update eval cases before broadening implementation.

## Testing Expectations

- Always run the repository harness validation before final handoff.
- Once code exists, use the commands defined by the slice brief and package scripts.
- DB work needs migration tests, RLS tests, and representative `EXPLAIN` notes for search/index changes.
- Agent runtime work needs pytest plus eval cases in `packages/agent-runtime-py/evals/`.
- Frontend work needs component or browser verification for layout, text overflow, keyboard flow, and approval queue states.

## GitHub Publishing

- For this repository, create and update PRs with the authenticated `gh` CLI by default.
- Do not try the GitHub connector for PR creation first; the connector installation can return `403 Resource not accessible by integration` here.
- The GitHub connector may still be used for read-only PR/issue inspection when it is useful and available.

## Agent Role Registry

Use `.agents/agents.toml` as the index of available development roles and focused subagents. These are prompt cards for human or AI use; they do not change product runtime behavior.

Default routing:

- Planning and slice selection: `slice-orchestrator`
- Monorepo and dependency boundaries: `foundation-architect`
- DB, RLS, search, patch persistence: `db-rbac-engineer`
- Editor, desktop/web UI, approval queue: `editor-product-engineer`
- Agent daemon, pydantic-ai workers, prompts: `agent-runtime-engineer`
- Extensions, plugin SDK, MCP: `extension-platform-engineer`
- Evals, observability, cost, release gates: `quality-observability-engineer`

## Handoff Format

Every final implementation note should include:

- Slice ID and PRD sections used.
- Files changed.
- Tests and harness commands run.
- Any acceptance criteria still unproven.
- Any PRD decision that had to be interpreted rather than implemented literally.
