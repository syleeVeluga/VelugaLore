"""Golden eval gate for IngestAgent S-09a behavior."""

from dataclasses import dataclass

from weki_agents.ingest import IngestRequest, create_ingest_patch
from weki_agents.models import IngestCreateDocOp

INGEST_EVAL_THRESHOLD = 0.8


@dataclass(frozen=True)
class IngestEvalCase:
    id: str
    request: IngestRequest
    raw_id: str
    min_docs: int
    max_docs: int


@dataclass(frozen=True)
class IngestEvalResult:
    score: float
    passed: bool
    case_scores: dict[str, float]


GOLDEN_CASES = [
    IngestEvalCase(
        id="ingest-policy-md",
        request=IngestRequest(
            input="/ingest path:./inbox/onboarding.md",
            context={
                "rawSource": {
                    "rawId": "raw-onboarding",
                    "uri": "file://./inbox/onboarding.md",
                    "mime": "text/markdown",
                    "sha256": "abc123",
                    "bytes": 128,
                    "text": "Onboarding policy defines approvals. The checklist covers security, tools, and manager review.",
                }
            },
        ),
        raw_id="raw-onboarding",
        min_docs=3,
        max_docs=10,
    ),
    IngestEvalCase(
        id="ingest-url",
        request=IngestRequest(
            input="/ingest url:https://example.com/wiki",
            context={
                "rawSource": {
                    "rawId": "raw-url",
                    "uri": "https://example.com/wiki",
                    "mime": "text/html",
                    "sha256": "def456",
                    "bytes": 256,
                    "text": "LLM wiki systems compound through ingest, ask, and curation loops. Search and links preserve reusable context.",
                }
            },
        ),
        raw_id="raw-url",
        min_docs=3,
        max_docs=10,
    ),
]


def evaluate_ingest_agent() -> IngestEvalResult:
    case_scores = {case.id: _score_case(case) for case in GOLDEN_CASES}
    score = sum(case_scores.values()) / len(case_scores)
    return IngestEvalResult(score=score, passed=score >= INGEST_EVAL_THRESHOLD, case_scores=case_scores)


def _score_case(case: IngestEvalCase) -> float:
    patch = create_ingest_patch(case.request)
    create_docs = [op for op in patch.ops if isinstance(op, IngestCreateDocOp)]
    schema_score = 1.0 if patch.output_schema == "IngestPatch" and patch.kind == "Patch" else 0.0
    fanout_score = 1.0 if case.min_docs <= len(create_docs) <= case.max_docs else 0.0
    summary_score = 1.0 if any(op.doc_kind == "summary" for op in create_docs) else 0.0
    provenance_score = 1.0 if all(case.raw_id in op.frontmatter.sources for op in create_docs) else 0.0
    log_score = 1.0 if any(op.kind == "append_log" for op in patch.ops) else 0.0
    return (schema_score + fanout_score + summary_score + provenance_score + log_score) / 5
