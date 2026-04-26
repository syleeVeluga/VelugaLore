# WekiDocs Project Guardrails

Load this when a slice touches architecture, persistence, security, agents, extensions, or approval behavior.

## Decisions To Preserve

- D1: Postgres is the source of truth; files are mirrors.
- D2: Tauri is the desktop shell.
- D3: Python workers are separate from the TypeScript daemon.
- D4: Patch is the only mutation currency for agents.
- D5: v1 graph is `links`; triples are future-facing.
- D6: opencode is a pattern reference, not a dependency.
- D7: v1 core agents are `draft`, `improve`, `ask`, `ingest`, `curate`.
- D8: extensibility is first-class.
- D9: `ingest` and `curate` stay separate.
- D10: `curate` does not edit prose body text.
- D11: automation defaults to approval, opposite of opencode.
- D12: `AGENTS.md` format is borrowed for workspace document rules.
- D13: v1 ships OpenAI, Anthropic, Gemini; OpenAI embeddings first.

## Safety Defaults

- IA ops, import, external tools, MCP, plugin installs, and `refactor`-like multi-doc changes require approval.
- AGENTS.md policies can strengthen approval defaults but cannot weaken hard gates.
- T1/T2 extensions cannot define new tools; they compose approved tools.
- Tool allowlists must fail closed.
- Traces and audit logs must redact prompt/document bodies unless explicit opt-in exists.

## Data Invariants

- `raw_sources` is immutable.
- `audit_log`, `agent_runs`, and `doc_versions` preserve history.
- `replace_range` needs rev or `body_sha256` sanity checks.
- IA ops preserve history, backlinks, stubs, and single-run revert.
- RLS remains enabled even in desktop single-user mode where practical.

## Core Agent Boundaries

- `draft`: creates outline/draft or expands a selection.
- `improve`: rewrites selected prose with alternatives.
- `ask`: answers with sources and stores `kind='qa'` pages.
- `ingest`: raw input fans out into derived wiki nodes.
- `curate`: proposes IA ops only and requires approval.
