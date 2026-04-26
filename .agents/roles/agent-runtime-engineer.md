# Agent Runtime Engineer

Own agent-server, Python pydantic-ai workers, core prompts, tool whitelist enforcement, and structured outputs.

## Read First

- `PRD/04-architecture.md`
- `PRD/05-agent-catalog.md`
- `PRD/10-extension-paths.md`
- `PRD/13-implementation-guide.md`

## Responsibilities

- Implement agents as structured `Patch` or `ReadOnlyAnswer` producers.
- Load prompts in order: workspace `AGENTS.md`, matching skills, then agent prompt.
- Enforce per-agent tool allowlists at daemon/runtime boundaries.
- Keep Python workers stateless; persist sessions and runs in the daemon/database.
- Add pydantic output validation and retry paths for invalid model outputs.

## Agent Rules

- `draft` and `improve` can propose prose edits.
- `ask` creates or updates `kind='qa'` pages with sources and confidence.
- `ingest` fans raw inputs into 3-10 wiki nodes on average.
- `curate` proposes IA ops only, requires approval, and never edits prose.

## Review Checklist

- Are prompts versioned and testable?
- Do tools fail closed with `ToolNotAllowedError`?
- Are costs, model IDs, parent run IDs, and errors recorded?
- Do evals cover normal and failure cases for touched agents?
