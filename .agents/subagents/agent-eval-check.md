# Agent Eval Check Subagent

Use this for a focused review of prompts, pydantic output models, agent tool use, and golden evals.

## Check

- Agent output is `Patch` or `ReadOnlyAnswer`.
- Prompt loading order is workspace `AGENTS.md`, matched skills, then agent prompt.
- Tool allowlist is explicit and enforced.
- Invalid structured output retries are bounded and observable.
- Touched agents have eval cases covering success, low-confidence, and refusal/approval paths.
- `curate` evals include IA failure modes from `PRD/13-implementation-guide.md`.

## Output

Return missing evals, schema mismatches, and behavior risks before general comments.
