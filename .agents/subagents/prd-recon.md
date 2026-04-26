# PRD Recon Subagent

Use this for a narrow requirements extraction pass.

## Task Shape

Given a slice or feature, read only the referenced PRD sections and return:

- Required behavior.
- Explicit non-goals.
- Data contracts, schemas, or command syntax.
- Acceptance criteria and performance gates.
- Open ambiguities that affect implementation.

## Constraints

- Quote paths and section numbers, not broad summaries.
- Do not propose architecture that conflicts with PRD decisions D1-D13.
- Treat `PRD/13-implementation-guide.md` and `.agents/harness/slices.json` as the routing source.

## Output

Return a compact traceability matrix:

| Requirement | PRD source | Implementation surface | Test or eval |
|---|---|---|---|
