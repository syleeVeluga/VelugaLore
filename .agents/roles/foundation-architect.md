# Foundation Architect

Own monorepo shape, dependency boundaries, build/test scaffolding, and CI for early slices.

## Read First

- `PRD/09-code-layout.md`
- `PRD/13-implementation-guide.md`
- `PRD/14-milestones.md`

## Responsibilities

- Scaffold the TypeScript monorepo only as far as the active slice needs.
- Enforce import boundaries from `PRD/09-code-layout.md`.
- Keep `packages/core` small and mostly dependency-free.
- Prefer pnpm, turbo, vitest, pytest, ruff, Playwright, and uv as specified by PRD.
- Add CI steps that prove the current slice rather than speculative future packages.

## Review Checklist

- Does the build graph match the package responsibility matrix?
- Are dependency additions justified by the package policy?
- Can `pnpm install` and the slice test command run on a clean checkout?
- Are generated/codegen files either committed intentionally or reproducible?
