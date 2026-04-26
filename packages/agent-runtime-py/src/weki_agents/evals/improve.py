"""Golden eval gate for ImproveAgent S-08 behavior."""

from dataclasses import dataclass

from weki_agents.improve import ImproveRequest, create_improve_patch

IMPROVE_EVAL_THRESHOLD = 0.8


@dataclass(frozen=True)
class ImproveEvalCase:
    id: str
    request: ImproveRequest
    expected_alternatives: tuple[str, ...]
    max_words: int | None = None


@dataclass(frozen=True)
class ImproveEvalResult:
    score: float
    passed: bool
    case_scores: dict[str, float]


GOLDEN_CASES = [
    ImproveEvalCase(
        id="improve-executive-three-options",
        request=ImproveRequest(
            input="/improve --tone executive --maxWords 12",
            context={
                "docId": "doc-1",
                "body": "This is really a very important update for the team",
                "selection": {"from": 0, "to": 52},
            },
        ),
        expected_alternatives=("conservative", "tonal", "concise"),
        max_words=12,
    ),
    ImproveEvalCase(
        id="improve-selection-text-alias",
        request=ImproveRequest(
            input="/improve --tone formal",
            context={"docId": "doc-2", "selection": {"from": 4, "to": 15, "text": "Short note"}},
        ),
        expected_alternatives=("conservative", "tonal", "concise"),
    ),
]


def evaluate_improve_agent() -> ImproveEvalResult:
    case_scores = {case.id: _score_case(case) for case in GOLDEN_CASES}
    score = sum(case_scores.values()) / len(case_scores)
    return ImproveEvalResult(score=score, passed=score >= IMPROVE_EVAL_THRESHOLD, case_scores=case_scores)


def _score_case(case: ImproveEvalCase) -> float:
    patch = create_improve_patch(case.request)
    alternatives = [op.alternative_id for op in patch.ops]
    alternative_score = 1.0 if tuple(alternatives) == case.expected_alternatives else 0.0
    schema_score = 1.0 if patch.output_schema == "ImprovePatch" and patch.kind == "Patch" else 0.0
    readability_score = 1.0 if set(patch.readability_scores) == set(case.expected_alternatives) else 0.0
    max_words_score = 1.0
    if case.max_words is not None:
        max_words_score = 1.0 if all(len(op.text.split()) <= case.max_words for op in patch.ops) else 0.0
    return (alternative_score + schema_score + readability_score + max_words_score) / 4
