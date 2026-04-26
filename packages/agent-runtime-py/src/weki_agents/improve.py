"""Deterministic ImproveAgent fallback used by S-08 tests and evals."""

import re

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .models import ImprovePatch


class ImproveSelection(BaseModel):
    doc_id: str | None = Field(default=None, alias="docId")
    from_: int = Field(alias="from", ge=0)
    to: int = Field(ge=0)
    text: str | None = None

    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="after")
    def validate_range(self) -> "ImproveSelection":
        if self.from_ > self.to:
            raise ValueError("selection.from must be less than or equal to selection.to")
        return self


class ImproveContext(BaseModel):
    doc_id: str | None = Field(default=None, alias="docId")
    body: str = ""
    selection: ImproveSelection | None = None

    model_config = ConfigDict(populate_by_name=True)


class ImproveRequest(BaseModel):
    input: str = ""
    context: ImproveContext = Field(default_factory=ImproveContext)


LABELS = {
    "conservative": "Conservative cleanup",
    "tonal": "Tone-focused rewrite",
    "concise": "Concise rewrite",
}


def create_improve_patch(request: ImproveRequest) -> ImprovePatch:
    doc_id = request.context.doc_id or (request.context.selection.doc_id if request.context.selection else None) or "current-doc"
    selection = _selection_text(request)
    if selection is None:
        raise ValueError("IMPROVE_REQUIRES_SELECTION")

    from_, to, selected_text = selection
    tone = _tone(request.input)
    max_words = _max_words(request.input)
    alternatives = {
        "conservative": _fit_max_words(_conservative(selected_text), max_words),
        "tonal": _fit_max_words(_tonal(selected_text, tone), max_words),
        "concise": _fit_max_words(_concise(selected_text), max_words),
    }

    return ImprovePatch(
        rationale=(
            "conservative: cleaned grammar and flow while preserving wording. "
            f"tonal: emphasized {tone} tone without adding claims. "
            "concise: reduced filler and kept the original meaning."
        ),
        ops=[
            {
                "kind": "replace_range",
                "docId": doc_id,
                "from": from_,
                "to": to,
                "alternativeId": alternative_id,
                "label": LABELS[alternative_id],
                "text": text,
            }
            for alternative_id, text in alternatives.items()
        ],
        readabilityScores={alternative_id: _readability(text) for alternative_id, text in alternatives.items()},
    )


def _selection_text(request: ImproveRequest) -> tuple[int, int, str] | None:
    selection = request.context.selection
    if selection is None or selection.from_ == selection.to:
        return None
    text = selection.text
    if text is None:
        text = request.context.body[selection.from_ : selection.to]
    return (selection.from_, selection.to, text) if text.strip() else None


def _tone(input_text: str) -> str:
    match = re.search(r"--tone(?:=|\s+)([^\s]+)", input_text)
    return match.group(1) if match else "formal"


def _max_words(input_text: str) -> int | None:
    match = re.search(r"--maxWords(?:=|\s+)(\d+)", input_text)
    return int(match.group(1)) if match else None


def _conservative(text: str) -> str:
    return _ensure_terminal(_normalize(text))


def _tonal(text: str, tone: str) -> str:
    prefixes = {
        "casual": "In plain terms, ",
        "executive": "Key point: ",
        "formal": "In summary, ",
        "legal": "For clarity, ",
    }
    normalized = _normalize(text)
    return _ensure_terminal(f"{prefixes.get(tone, prefixes['formal'])}{normalized[:1].lower()}{normalized[1:]}")


def _concise(text: str) -> str:
    without_fillers = re.sub(r"\b(really|very|basically|actually|simply|clearly)\b", "", _normalize(text), flags=re.I)
    without_fillers = re.sub(r"\b(it is important to note that|please note that)\b", "", without_fillers, flags=re.I)
    return _ensure_terminal(_normalize(without_fillers).replace(" ,", ","))


def _fit_max_words(text: str, max_words: int | None) -> str:
    if max_words is None or max_words <= 0:
        return text
    words = text.split()
    return text if len(words) <= max_words else _ensure_terminal(" ".join(words[:max_words]))


def _readability(text: str) -> dict[str, float | int]:
    sentence_count = max(1, len(re.findall(r"[.!?]+", text)))
    words = [word for word in re.split(r"\s+", text) if word]
    syllables = max(1, sum(_count_syllables(word) for word in words))
    fk_grade = round(0.39 * (len(words) / sentence_count) + 11.8 * (syllables / max(1, len(words))) - 15.59, 2)
    return {"sentences": sentence_count, "words": len(words), "fkGrade": fk_grade}


def _count_syllables(word: str) -> int:
    normalized = re.sub(r"[^a-z]", "", word.lower())
    if not normalized:
        return 1
    groups = len(re.findall(r"[aeiouy]+", normalized)) or 1
    return max(1, groups - (1 if normalized.endswith("e") else 0))


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip())


def _ensure_terminal(text: str) -> str:
    return text if re.search(r"[.!?]$", text) else f"{text}."
