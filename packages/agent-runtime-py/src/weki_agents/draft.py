"""Deterministic DraftAgent fallback used by S-06 tests and evals."""

import re

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .models import DraftPatch


class DraftSelection(BaseModel):
    doc_id: str | None = Field(default=None, alias="docId")
    from_: int = Field(alias="from", ge=0)
    to: int = Field(ge=0)
    text: str | None = None

    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="after")
    def validate_range(self) -> "DraftSelection":
        if self.from_ > self.to:
            raise ValueError("selection.from must be less than or equal to selection.to")
        return self


class DraftContext(BaseModel):
    doc_id: str | None = Field(default=None, alias="docId")
    body: str = ""
    selection: DraftSelection | None = None

    model_config = ConfigDict(populate_by_name=True)


class DraftRequest(BaseModel):
    input: str = ""
    context: DraftContext = Field(default_factory=DraftContext)


SECTIONS = [
    ("Context", "why this page matters and what problem it addresses"),
    ("Goals", "the outcomes the reader should understand or act on"),
    ("Approach", "the practical path, constraints, and operating principles"),
    ("Details", "the concrete points that turn the idea into usable work"),
    ("Next Steps", "the decisions, owners, or follow-up work needed next"),
]


def create_draft_patch(request: DraftRequest) -> DraftPatch:
    doc_id = request.context.doc_id or (request.context.selection.doc_id if request.context.selection else None) or "current-doc"
    prompt = _prompt_text(request.input)
    audience = _audience(request.input)
    selection = _selection_text(request)

    if selection is not None:
        from_, to, selected_text = selection
        return DraftPatch(
            rationale=f"Expanded the selected passage for {audience} using the available document context.",
            assumptions=[f"Audience interpreted as {audience}."],
            ops=[
                {
                    "kind": "replace_range",
                    "docId": doc_id,
                    "from": from_,
                    "to": to,
                    "text": _expanded_selection(selected_text, prompt, audience),
                }
            ],
        )

    if not request.context.body.strip():
        return DraftPatch(
            rationale=f"Created a five-section outline and first-pass draft for {audience}.",
            assumptions=[f"Topic interpreted as {prompt}.", f"Audience interpreted as {audience}."],
            ops=[
                {
                    "kind": "insert_section_tree",
                    "docId": doc_id,
                    "position": "document_start",
                    "sections": [{"heading": heading, "level": 2} for heading, _ in SECTIONS],
                },
                *[
                    {
                        "kind": "append_paragraph",
                        "docId": doc_id,
                        "sectionHeading": heading,
                        "text": _section_paragraph(angle, prompt, audience),
                    }
                    for heading, angle in SECTIONS
                ],
            ],
        )

    return DraftPatch(
        rationale=f"Appended a focused draft paragraph for {audience}.",
        assumptions=[f"Topic interpreted as {prompt}.", "Existing document body was preserved."],
        ops=[
            {
                "kind": "append_paragraph",
                "docId": doc_id,
                "sectionHeading": "Draft",
                "text": _section_paragraph(SECTIONS[2][1], prompt, audience),
            }
        ],
    )


def _audience(input_text: str) -> str:
    match = re.search(r"--audience(?:=|\s+)([^\s]+)", input_text)
    return match.group(1) if match else "general readers"


def _prompt_text(input_text: str) -> str:
    text = re.sub(r"^/?draft\b", "", input_text.strip(), flags=re.IGNORECASE)
    text = re.sub(r"--audience(?:=|\s+)[^\s]+", "", text).strip()
    return text or "the current page"


def _selection_text(request: DraftRequest) -> tuple[int, int, str] | None:
    selection = request.context.selection
    if selection is None or selection.from_ == selection.to:
        return None
    text = selection.text
    if text is None:
        text = request.context.body[selection.from_ : selection.to]
    return (selection.from_, selection.to, text) if text.strip() else None


def _section_paragraph(angle: str, prompt: str, audience: str) -> str:
    return (
        f"For {audience}, this section should explain {angle} for {prompt}. "
        "It should stay concrete, name the important tradeoffs, and give the reader enough detail "
        "to continue editing without needing a separate planning pass."
    )


def _expanded_selection(selection_text: str, prompt: str, audience: str) -> str:
    return (
        f"{selection_text.strip()}\n\n"
        f"For {audience}, expand this into a clearer draft by adding the purpose, the practical "
        f"implications, and the next decision the reader should make. Keep the original intent "
        f"intact while making the {prompt} angle explicit."
    )
