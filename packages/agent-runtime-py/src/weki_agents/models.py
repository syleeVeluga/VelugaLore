"""Structured output models for WekiDocs agents."""

from typing import Any, ClassVar, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class AgentModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    def model_dump(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        kwargs.setdefault("by_alias", True)
        return super().model_dump(*args, **kwargs)

    def model_dump_json(self, *args: Any, **kwargs: Any) -> str:
        kwargs.setdefault("by_alias", True)
        return super().model_dump_json(*args, **kwargs)


class DraftSection(AgentModel):
    heading: str
    level: int = Field(ge=1, le=6)


class InsertSectionTreeOp(AgentModel):
    kind: Literal["insert_section_tree"]
    doc_id: str | None = Field(default=None, alias="docId")
    position: Literal["document_start", "document_end"] = "document_start"
    sections: list[DraftSection] = Field(min_length=1)


class ReplaceRangeOp(AgentModel):
    kind: Literal["replace_range"]
    doc_id: str = Field(alias="docId")
    from_: int = Field(alias="from", ge=0)
    to: int = Field(ge=0)
    text: str = Field(min_length=1)

    @model_validator(mode="after")
    def validate_range(self) -> "ReplaceRangeOp":
        if self.from_ > self.to:
            raise ValueError("replace_range.from must be less than or equal to replace_range.to")
        return self


class AppendParagraphOp(AgentModel):
    kind: Literal["append_paragraph"]
    doc_id: str | None = Field(default=None, alias="docId")
    section_heading: str | None = Field(default=None, alias="sectionHeading")
    text: str = Field(min_length=1)


DraftPatchOp = InsertSectionTreeOp | ReplaceRangeOp | AppendParagraphOp


class DraftPatch(AgentModel):
    kind: Literal["Patch"] = "Patch"
    output_schema: Literal["DraftPatch"] = Field(default="DraftPatch", alias="outputSchema")
    agent_id: Literal["draft"] = Field(default="draft", alias="agentId")
    ops: list[DraftPatchOp] = Field(min_length=1)
    rationale: str
    requires_approval: bool = Field(default=True, alias="requiresApproval")
    assumptions: list[str] = Field(default_factory=list)


ImproveAlternativeId = Literal["conservative", "tonal", "concise"]
IMPROVE_ALTERNATIVE_IDS = ("conservative", "tonal", "concise")


class ImproveReplaceRangeOp(ReplaceRangeOp):
    alternative_id: ImproveAlternativeId = Field(alias="alternativeId")
    label: str = Field(min_length=1)


class ReadabilityScore(AgentModel):
    sentences: int = Field(ge=1)
    words: int = Field(ge=0)
    fk_grade: float = Field(alias="fkGrade")


class ImprovePatch(AgentModel):
    expected_alternatives: ClassVar[tuple[str, ...]] = IMPROVE_ALTERNATIVE_IDS

    kind: Literal["Patch"] = "Patch"
    output_schema: Literal["ImprovePatch"] = Field(default="ImprovePatch", alias="outputSchema")
    agent_id: Literal["improve"] = Field(default="improve", alias="agentId")
    ops: list[ImproveReplaceRangeOp] = Field(min_length=3, max_length=3)
    readability_scores: dict[ImproveAlternativeId, ReadabilityScore] = Field(alias="readabilityScores")
    rationale: str
    requires_approval: bool = Field(default=True, alias="requiresApproval")

    @model_validator(mode="after")
    def validate_exact_alternatives(self) -> "ImprovePatch":
        expected = set(self.expected_alternatives)
        op_ids = [op.alternative_id for op in self.ops]
        if set(op_ids) != expected or len(op_ids) != len(set(op_ids)):
            raise ValueError("ImprovePatch must include exactly one conservative, tonal, and concise alternative")
        if set(self.readability_scores) != expected:
            raise ValueError("ImprovePatch readabilityScores must include conservative, tonal, and concise")
        return self


class AskSource(AgentModel):
    doc_id: str = Field(alias="docId", min_length=1)
    title: str = Field(min_length=1)
    path: str | None = None
    snippet: str = Field(min_length=1)
    score: float | None = Field(default=None, ge=0, le=1)


class CreateDocOp(AgentModel):
    kind: Literal["create_doc"]
    doc_id: str | None = Field(default=None, alias="docId")
    path: str = Field(min_length=1)
    title: str = Field(min_length=1)
    doc_kind: Literal[
        "concept",
        "entity",
        "source",
        "overview",
        "index",
        "log",
        "qa",
        "summary",
        "slides",
        "draft",
        "stub",
    ] = Field(alias="docKind")
    body: str = Field(min_length=1)
    frontmatter: dict[str, Any] = Field(default_factory=dict)


class AskQaFrontmatter(AgentModel):
    kind: Literal["qa"]
    question: str = Field(min_length=1)
    sources: list[str] = Field(min_length=1)
    confidence: float = Field(ge=0, le=1)


class AskCreateDocOp(CreateDocOp):
    doc_kind: Literal["qa"] = Field(alias="docKind")
    frontmatter: AskQaFrontmatter


class AskAnswerPayload(AgentModel):
    answer_md: str = Field(alias="answerMd", min_length=1)
    sources: list[AskSource] = Field(min_length=1)
    confidence: float = Field(ge=0, le=1)


class AskPatch(AgentModel):
    kind: Literal["Patch"] = "Patch"
    output_schema: Literal["AskAnswerPatch"] = Field(default="AskAnswerPatch", alias="outputSchema")
    agent_id: Literal["ask"] = Field(default="ask", alias="agentId")
    ops: list[AskCreateDocOp] = Field(min_length=1)
    answer: AskAnswerPayload
    rationale: str
    requires_approval: bool = Field(default=True, alias="requiresApproval")
