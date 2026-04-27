"""Structured output models for WekiDocs agents."""

from typing import Annotated, Any, ClassVar, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator


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
    sources: list[Annotated[str, StringConstraints(min_length=1)]] = Field(min_length=1)
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


class RawSourceRef(AgentModel):
    raw_id: str = Field(alias="rawId", min_length=1)
    uri: str = Field(min_length=1)
    mime: str = Field(min_length=1)
    sha256: str = Field(min_length=1)
    bytes: int = Field(ge=0)
    text: str | None = None


class IngestDocFrontmatter(AgentModel):
    kind: Literal["summary", "entity", "concept", "source"]
    sources: list[Annotated[str, StringConstraints(min_length=1)]] = Field(min_length=1)
    imported_at: str = Field(alias="importedAt", min_length=1)
    confidence: float = Field(ge=0, le=1)
    raw: dict[str, Any] | None = None


class IngestCreateDocOp(CreateDocOp):
    doc_kind: Literal["summary", "entity", "concept", "source"] = Field(alias="docKind")
    frontmatter: IngestDocFrontmatter


class IndexEntryPatch(AgentModel):
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
    source_doc_ids: list[str] = Field(default_factory=list, alias="sourceDocIds")
    action: Literal["upsert", "remove"] = "upsert"


class UpdateIndexOp(AgentModel):
    kind: Literal["update_index"]
    index_path: str = Field(default="wiki/_index.md", alias="indexPath")
    entries: list[IndexEntryPatch] = Field(min_length=1)


class InsertLinkOp(AgentModel):
    kind: Literal["insert_link"]
    doc_id: str | None = Field(default=None, alias="docId")
    target_doc_id: str | None = Field(default=None, alias="targetDocId")
    target_path: str | None = Field(default=None, alias="targetPath")
    alias: str | None = None
    at: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_target(self) -> "InsertLinkOp":
        if not self.target_doc_id and not self.target_path:
            raise ValueError("insert_link requires either targetDocId or targetPath")
        return self


class AppendLogOp(AgentModel):
    kind: Literal["append_log"]
    log_path: str = Field(default="wiki/log/ingest.md", alias="logPath")
    line: str = Field(min_length=1)
    frontmatter: dict[str, Any] = Field(default_factory=dict)


IngestPatchOp = IngestCreateDocOp | UpdateIndexOp | InsertLinkOp | AppendLogOp


class IngestFanOut(AgentModel):
    summary: int = Field(ge=1, le=1)
    entities: int = Field(ge=0)
    concepts: int = Field(ge=0)
    updated_existing: int = Field(default=0, alias="updatedExisting", ge=0)


class IngestPatch(AgentModel):
    kind: Literal["Patch"] = "Patch"
    output_schema: Literal["IngestPatch"] = Field(default="IngestPatch", alias="outputSchema")
    agent_id: Literal["ingest"] = Field(default="ingest", alias="agentId")
    ops: list[IngestPatchOp] = Field(min_length=3)
    fan_out: IngestFanOut = Field(alias="fanOut")
    rationale: str
    requires_approval: bool = Field(default=True, alias="requiresApproval")

    @model_validator(mode="after")
    def validate_fan_out(self) -> "IngestPatch":
        create_docs = [op for op in self.ops if isinstance(op, IngestCreateDocOp)]
        if len(create_docs) < 3 or len(create_docs) > 10:
            raise ValueError("IngestPatch must create between 3 and 10 wiki nodes for each raw source")
        summary_docs = [op for op in create_docs if op.doc_kind == "summary"]
        if len(summary_docs) != 1:
            raise ValueError("IngestPatch must include exactly one summary document")
        if not any(isinstance(op, AppendLogOp) for op in self.ops):
            raise ValueError("IngestPatch must append an ingest log entry")
        return self


class IaEvidence(AgentModel):
    source: str = Field(min_length=1)
    score: float | None = Field(default=None, ge=0, le=1)
    note: str = Field(min_length=1)


class SplitCut(AgentModel):
    at: int = Field(ge=0)
    new_path: str = Field(alias="newPath", min_length=1)
    new_title: str = Field(alias="newTitle", min_length=1)
    carry_frontmatter: bool = Field(default=True, alias="carryFrontmatter")


class SplitDocOp(AgentModel):
    kind: Literal["split_doc"]
    doc_id: str = Field(alias="docId", min_length=1)
    cuts: list[SplitCut] = Field(min_length=1)
    leave_stub: bool = Field(default=True, alias="leaveStub")
    evidence: IaEvidence


class MergeDocsOp(AgentModel):
    kind: Literal["merge_docs"]
    doc_ids: list[Annotated[str, StringConstraints(min_length=1)]] = Field(alias="docIds", min_length=2)
    into_path: str = Field(alias="intoPath", min_length=1)
    into_title: str = Field(alias="intoTitle", min_length=1)
    redirect_strategy: Literal["stub", "tombstone"] = Field(default="stub", alias="redirectStrategy")
    preserve_history: Literal[True] = Field(alias="preserveHistory")
    evidence: IaEvidence


class MoveDocOp(AgentModel):
    kind: Literal["move_doc"]
    doc_id: str = Field(alias="docId", min_length=1)
    new_path: str = Field(alias="newPath", min_length=1)
    relink: bool = True
    leave_stub: bool = Field(default=True, alias="leaveStub")
    evidence: IaEvidence


class AdoptOrphanOp(AgentModel):
    kind: Literal["adopt_orphan"]
    doc_id: str = Field(alias="docId", min_length=1)
    parent_index_doc_id: str = Field(alias="parentIndexDocId", min_length=1)
    section: str | None = None
    evidence: IaEvidence


CuratePatchOp = SplitDocOp | MergeDocsOp | MoveDocOp | AdoptOrphanOp
FailureModeId = Literal["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10"]


class CuratePatch(AgentModel):
    kind: Literal["Patch"] = "Patch"
    output_schema: Literal["CuratePatch"] = Field(default="CuratePatch", alias="outputSchema")
    agent_id: Literal["curate"] = Field(default="curate", alias="agentId")
    ops: list[CuratePatchOp] = Field(min_length=1, max_length=50)
    rationale: str = Field(min_length=1)
    rationale_per_op: list[Annotated[str, StringConstraints(min_length=1)]] = Field(alias="rationalePerOp", min_length=1)
    requires_approval: Literal[True] = Field(default=True, alias="requiresApproval")
    preview_html: str | None = Field(default=None, alias="previewHtml")
    failure_modes_considered: list[FailureModeId] = Field(default_factory=list, alias="failureModesConsidered")

    @model_validator(mode="after")
    def validate_rationale_alignment(self) -> "CuratePatch":
        if len(self.rationale_per_op) != len(self.ops):
            raise ValueError("CuratePatch rationalePerOp must contain one rationale for each IA op")
        return self
