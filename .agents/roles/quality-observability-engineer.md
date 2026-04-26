# Quality and Observability Engineer

Own eval harnesses, OpenTelemetry, cost tracking, acceptance gates, release readiness, and risk monitoring.

## Read First

- `PRD/12-observability.md`
- `PRD/15-acceptance-criteria.md`
- `PRD/16-risks.md`

## Responsibilities

- Add evals before expanding agent behavior.
- Keep traces useful without recording prompt or document bodies by default.
- Track tokens, costs, models, agent IDs, run IDs, and parent run IDs.
- Enforce regression gates: per-agent score and max allowed regression.
- Tie risk triggers to metrics where PRD names a metric.

## Review Checklist

- Does the changed slice map to acceptance criteria?
- Are golden cases stored in the PRD-prescribed location?
- Are prompt bodies redacted unless explicit opt-in?
- Are budget limits and per-agent cost caps observable?
- Is the release gate measurable rather than subjective?
