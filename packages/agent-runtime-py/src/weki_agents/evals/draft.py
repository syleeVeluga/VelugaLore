"""Golden eval gate for DraftAgent S-06 behavior."""

from dataclasses import dataclass

from weki_agents.draft import DraftRequest, create_draft_patch

DRAFT_EVAL_THRESHOLD = 0.8


@dataclass(frozen=True)
class DraftEvalCase:
    id: str
    request: DraftRequest
    expected_ops: tuple[str, ...]
    must_include: tuple[str, ...]


@dataclass(frozen=True)
class DraftEvalResult:
    score: float
    passed: bool
    case_scores: dict[str, float]


GOLDEN_CASES = [
    DraftEvalCase(
        id="draft-empty-outline",
        request=DraftRequest(
            input="/draft onboarding guide --audience editors",
            context={"docId": "doc-1", "body": ""},
        ),
        expected_ops=("insert_section_tree", "append_paragraph"),
        must_include=("editors", "onboarding guide"),
    ),
    DraftEvalCase(
        id="draft-selection-expand",
        request=DraftRequest(
            input="/draft launch note --audience executives",
            context={
                "docId": "doc-2",
                "body": "Intro\nShort note.\nEnd",
                "selection": {"from": 6, "to": 17},
            },
        ),
        expected_ops=("replace_range",),
        must_include=("Short note.", "executives", "launch note"),
    ),
    DraftEvalCase(
        id="draft-existing-doc-append",
        request=DraftRequest(
            input="/draft adoption plan",
            context={"docId": "doc-3", "body": "# Adoption\nExisting notes."},
        ),
        expected_ops=("append_paragraph",),
        must_include=("adoption plan", "general readers"),
    ),
]


def evaluate_draft_agent() -> DraftEvalResult:
    case_scores = {case.id: _score_case(case) for case in GOLDEN_CASES}
    score = sum(case_scores.values()) / len(case_scores)
    return DraftEvalResult(score=score, passed=score >= DRAFT_EVAL_THRESHOLD, case_scores=case_scores)


def _score_case(case: DraftEvalCase) -> float:
    patch = create_draft_patch(case.request)
    op_kinds = [op.kind for op in patch.ops]
    expected_score = sum(1 for kind in case.expected_ops if kind in op_kinds) / len(case.expected_ops)
    body = " ".join(str(op.model_dump(by_alias=True)) for op in patch.ops)
    include_score = sum(1 for text in case.must_include if text in body) / len(case.must_include)
    schema_score = 1.0 if patch.output_schema == "DraftPatch" and patch.kind == "Patch" else 0.0
    return (expected_score + include_score + schema_score) / 3
