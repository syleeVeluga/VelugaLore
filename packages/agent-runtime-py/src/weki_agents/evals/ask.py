"""Golden eval gate for AskAgent S-08 behavior."""

from dataclasses import dataclass

from weki_agents.ask import AskRequest, create_ask_patch

ASK_EVAL_THRESHOLD = 0.8


@dataclass(frozen=True)
class AskEvalCase:
    id: str
    request: AskRequest
    expected_source: str
    expected_path: str


@dataclass(frozen=True)
class AskEvalResult:
    score: float
    passed: bool
    case_scores: dict[str, float]


GOLDEN_CASES = [
    AskEvalCase(
        id="ask-stores-qa-with-source",
        request=AskRequest(
            input="/ask onboarding policy definition",
            context={
                "documents": [
                    {
                        "docId": "doc-policy",
                        "title": "Onboarding Policy",
                        "path": "wiki/policies/onboarding.md",
                        "body": "The onboarding policy defines the first week checklist and required approvals.",
                    },
                    {
                        "docId": "doc-random",
                        "title": "Unrelated",
                        "body": "Quarterly roadmap notes.",
                    },
                ]
            },
        ),
        expected_source="doc-policy",
        expected_path="wiki/qa/onboarding-policy-definition-cba456b6.md",
    ),
    AskEvalCase(
        id="ask-current-doc-source",
        request=AskRequest(
            input="/ask retention policy",
            context={
                "docId": "doc-retention",
                "title": "Retention Policy",
                "path": "wiki/policies/retention.md",
                "body": "The retention policy requires storing audit logs indefinitely.",
            },
        ),
        expected_source="doc-retention",
        expected_path="wiki/qa/retention-policy-4f08a35c.md",
    ),
]


def evaluate_ask_agent() -> AskEvalResult:
    case_scores = {case.id: _score_case(case) for case in GOLDEN_CASES}
    score = sum(case_scores.values()) / len(case_scores)
    return AskEvalResult(score=score, passed=score >= ASK_EVAL_THRESHOLD, case_scores=case_scores)


def _score_case(case: AskEvalCase) -> float:
    patch = create_ask_patch(case.request)
    op = patch.ops[0]
    schema_score = 1.0 if patch.output_schema == "AskAnswerPatch" and patch.kind == "Patch" else 0.0
    qa_score = 1.0 if op.doc_kind == "qa" and op.path == case.expected_path else 0.0
    source_score = 1.0 if patch.answer.sources[0].doc_id == case.expected_source else 0.0
    frontmatter_score = 1.0 if case.expected_source in op.frontmatter.sources else 0.0
    return (schema_score + qa_score + source_score + frontmatter_score) / 4
