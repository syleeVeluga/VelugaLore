"""Structured output models for WekiDocs agents."""

from typing import Any, Literal

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
