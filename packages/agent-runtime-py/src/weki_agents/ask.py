"""Deterministic AskAgent fallback used by S-08 tests and evals."""

import re
from zlib import crc32

from pydantic import BaseModel, ConfigDict, Field

from .models import AskPatch, AskSource


class AskDocument(BaseModel):
    doc_id: str = Field(alias="docId")
    title: str
    path: str | None = None
    body: str

    model_config = ConfigDict(populate_by_name=True)


class AskContext(BaseModel):
    doc_id: str | None = Field(default=None, alias="docId")
    title: str | None = None
    path: str | None = None
    body: str = ""
    documents: list[AskDocument] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True)


class AskRequest(BaseModel):
    input: str = ""
    context: AskContext = Field(default_factory=AskContext)


def create_ask_patch(request: AskRequest) -> AskPatch:
    query = _query(request.input)
    sources = _search(query, _documents(request))
    if not sources:
        raise ValueError("ASK_REQUIRES_SOURCES")

    confidence = _confidence(sources)
    answer_md = _answer(query, sources, confidence)
    title = _title(query)
    body = _qa_body(query, title, answer_md, sources, confidence)

    return AskPatch(
        rationale=f"Answered from {len(sources)} workspace source(s) and prepared a kind='qa' page for reuse.",
        answer={"answerMd": answer_md, "sources": sources, "confidence": confidence},
        ops=[
            {
                "kind": "create_doc",
                "path": f"wiki/qa/{_slug(title)}.md",
                "title": title,
                "docKind": "qa",
                "body": body,
                "frontmatter": {
                    "kind": "qa",
                    "question": query,
                    "sources": [source.doc_id for source in sources],
                    "confidence": confidence,
                },
            }
        ],
    )


def _query(input_text: str) -> str:
    query = re.sub(r"^/?ask\b", "", input_text.strip(), flags=re.I).strip()
    return query or "current workspace question"


def _documents(request: AskRequest) -> list[AskDocument]:
    documents = list(request.context.documents)
    if request.context.body.strip() and request.context.doc_id and all(
        document.doc_id != request.context.doc_id for document in documents
    ):
        documents.append(
            AskDocument(
                docId=request.context.doc_id,
                title=request.context.title or request.context.doc_id,
                path=request.context.path,
                body=request.context.body,
            )
        )
    return [document for document in documents if document.body.strip()]


def _search(query: str, documents: list[AskDocument]) -> list[AskSource]:
    query_terms = _tokens(query)
    hits: list[AskSource] = []
    for document in documents:
        document_terms = _tokens(f"{document.title} {document.body}")
        overlap = len(query_terms & document_terms)
        score = overlap / len(query_terms) if query_terms else 0
        if score > 0:
            hits.append(
                AskSource(
                    docId=document.doc_id,
                    title=document.title,
                    path=document.path,
                    snippet=_snippet(document.body, query_terms),
                    score=score,
                )
            )
    return sorted(hits, key=lambda source: source.score or 0, reverse=True)[:5]


def _answer(query: str, sources: list[AskSource], confidence: float) -> str:
    links = ", ".join(f"[[{source.title}]]" for source in sources)
    lines = [
        f'Answering "{query}" from workspace sources: {links}.',
        f"The strongest supporting note says: {sources[0].snippet}",
    ]
    if confidence < 0.6:
        lines.append("Confidence is limited because the query only partially matched the available notes.")
    return "\n\n".join(lines)


def _qa_body(query: str, title: str, answer_md: str, sources: list[AskSource], confidence: float) -> str:
    source_lines = "\n".join(
        f"- [[{source.title}]]{f' ({source.path})' if source.path else ''}: {source.snippet}" for source in sources
    )
    return f"# {title}\n\n{answer_md}\n\n## Sources\n\n{source_lines}\n\n## Metadata\n\nconfidence: {confidence:.2f}\n"


def _confidence(sources: list[AskSource]) -> float:
    best = sources[0].score or 0
    breadth = min(0.2, len(sources) * 0.04)
    return round(min(0.95, max(0.35, best * 0.75 + breadth)), 2)


def _snippet(body: str, query_terms: set[str]) -> str:
    sentences = [sentence.strip() for sentence in re.split(r"(?<=[.!?])\s+", body) if sentence.strip()]
    ranked = sorted(sentences, key=lambda sentence: len(_tokens(sentence) & query_terms), reverse=True)
    return _truncate(ranked[0] if ranked else body.strip(), 220)


def _tokens(text: str) -> set[str]:
    return {term for term in re.split(r"[^\w]+", text.lower()) if len(term) >= 2}


def _title(query: str) -> str:
    return _truncate(re.sub(r"[?!.]+$", "", query).strip(), 80) or "Workspace question"


def _slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or f"qa-{crc32(value.encode('utf-8')):x}"


def _truncate(value: str, max_length: int) -> str:
    return value if len(value) <= max_length else f"{value[: max_length - 1].rstrip()}..."
