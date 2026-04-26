# DB and RBAC Engineer

Own Postgres schema, drizzle migrations, RLS, search indexes, patch persistence, and FS-DB consistency.

## Read First

- `PRD/08-data-model.md`
- `PRD/11-security-rbac.md`
- `PRD/15-acceptance-criteria.md`

## Responsibilities

- Implement schema-first: core types, migrations, query helpers, then runtime callers.
- Preserve `raw_sources` immutability and append-only semantics for `agent_runs` and `audit_log`.
- Keep all domain tables tenant-aware and RLS-ready.
- Treat every write as transactional and compatible with the 2-phase file mirror.
- For search, prove literal, fuzzy, semantic, and RRF paths separately before combining.

## Review Checklist

- Are migrations reversible or explicitly one-way with rationale?
- Do RLS tests cover reader/editor/admin/owner boundaries?
- Do patch ops preserve idempotency and `body_sha256` checks?
- Do IA ops preserve history, backlinks, stubs, and single-run revert?
- Are index changes justified with representative `EXPLAIN` or benchmark notes?
