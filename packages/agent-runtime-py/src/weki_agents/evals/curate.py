"""Golden eval gate for CurateAgent S-09b behavior."""

from dataclasses import dataclass

from weki_agents.curate import CurateRequest, create_curate_patch

CURATE_EVAL_THRESHOLD = 0.8


@dataclass(frozen=True)
class CurateEvalCase:
    id: str
    request: CurateRequest
    expected_ops: set[str]
    expected_failure_mode: str | None = None


@dataclass(frozen=True)
class CurateEvalResult:
    score: float
    passed: bool
    case_scores: dict[str, float]


GOLDEN_CASES = [
    CurateEvalCase(
        id="curate-ia-normal",
        request=CurateRequest(
            input="/curate scope:wiki/policies",
            context={
                "documents": [
                    {"docId": "index", "title": "Policies", "path": "wiki/policies/_index.md", "body": "# Policies", "kind": "index"},
                    {
                        "docId": "dup-a",
                        "title": "Onboarding Policy",
                        "path": "wiki/policies/onboarding.md",
                        "body": "# Onboarding\n\nAccess approval manager review security checklist.",
                        "kind": "concept",
                    },
                    {
                        "docId": "dup-b",
                        "title": "Onboarding Checklist",
                        "path": "wiki/policies/onboarding-checklist.md",
                        "body": "# Onboarding\n\nAccess approval manager review security checklist.",
                        "kind": "concept",
                    },
                    {"docId": "misfiled", "title": "Security", "path": "wiki/policies/security.md", "body": "# Security\n\n[[Policies]]", "kind": "concept"},
                    {"docId": "orphan", "title": "Orphan", "path": "wiki/policies/orphan.md", "body": "# Orphan", "kind": "draft"},
                ]
            },
        ),
        expected_ops={"merge_docs", "move_doc", "adopt_orphan"},
    ),
    CurateEvalCase(
        id="curate-f2-false-merge-guard",
        request=CurateRequest(
            input="/curate scope:wiki/policies",
            context={
                "documents": [
                    {"docId": "a", "title": "Apple Policy", "path": "wiki/policies/apple.md", "body": "shared template words only", "kind": "concept"},
                    {"docId": "b", "title": "Apple Vendor", "path": "wiki/entities/apple.md", "body": "shared template words only", "kind": "entity"},
                ]
            },
        ),
        expected_ops={"move_doc"},
        expected_failure_mode="F2",
    ),
]


def evaluate_curate_agent() -> CurateEvalResult:
    case_scores = {case.id: _score_case(case) for case in GOLDEN_CASES}
    score = sum(case_scores.values()) / len(case_scores)
    return CurateEvalResult(score=score, passed=score >= CURATE_EVAL_THRESHOLD, case_scores=case_scores)


def _score_case(case: CurateEvalCase) -> float:
    patch = create_curate_patch(case.request)
    op_kinds = {op.kind for op in patch.ops}
    schema_score = 1.0 if patch.output_schema == "CuratePatch" and patch.kind == "Patch" else 0.0
    approval_score = 1.0 if patch.requires_approval is True else 0.0
    op_score = len(case.expected_ops & op_kinds) / len(case.expected_ops)
    ia_only_score = 1.0 if op_kinds <= {"split_doc", "merge_docs", "move_doc", "adopt_orphan"} else 0.0
    rationale_score = 1.0 if len(patch.rationale_per_op) == len(patch.ops) else 0.0
    failure_score = 1.0
    if case.expected_failure_mode:
        failure_score = 1.0 if case.expected_failure_mode in patch.failure_modes_considered else 0.0
    return (schema_score + approval_score + op_score + ia_only_score + rationale_score + failure_score) / 6
