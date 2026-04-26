# Schema Migration Check Subagent

Use this for an independent pass over schema, migration, RLS, and patch persistence changes.

## Check

- Domain tables include tenant/workspace isolation where required.
- `raw_sources` is immutable.
- `audit_log`, `agent_runs`, and `doc_versions` preserve append-only/history semantics.
- Patch ops are idempotent or guarded by `body_sha256` and rev checks.
- IA ops preserve history, backlinks, stubs, and single-run revert.
- RLS policies deny by default and test all roles.
- Search indexes match `/find`, `/grep`, `/compare`, `/duplicates`, and `/cluster` requirements.

## Output

List findings first, with file and line references when code exists. Include the acceptance criteria affected.
