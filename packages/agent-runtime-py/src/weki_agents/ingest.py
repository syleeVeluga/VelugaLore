"""Deterministic IngestAgent fallback used by S-09a tests and evals."""

import re
from datetime import UTC, datetime
from zlib import crc32

from pydantic import BaseModel, ConfigDict, Field

from .models import IngestPatch, RawSourceRef


class IngestContext(BaseModel):
    raw_source: RawSourceRef | None = Field(default=None, alias="rawSource")
    body: str = ""

    model_config = ConfigDict(populate_by_name=True)


class IngestRequest(BaseModel):
    input: str = ""
    context: IngestContext = Field(default_factory=IngestContext)


def create_ingest_patch(request: IngestRequest) -> IngestPatch:
    raw = _raw_source(request)
    text = (raw.text or request.context.body or _strip_ingest_verb(request.input) or raw.uri).strip()
    imported_at = datetime.now(UTC).isoformat()
    base_title = _title_from_uri(raw.uri)
    slug = _slug(base_title) or f"raw-{_hash(raw.sha256)}"
    topics = _topics(text)[:9]
    while len(topics) < 2:
        topics.append(("Key Context" if len(topics) == 0 else "Source Notes", "concept", text))

    create_ops = [
        {
            "kind": "create_doc",
            "path": f"wiki/sources/{slug}.md",
            "title": f"{base_title} Summary",
            "docKind": "summary",
            "body": _summary_body(base_title, text, topics),
            "frontmatter": _frontmatter("summary", raw, imported_at, 0.82),
        },
        *[
            {
                "kind": "create_doc",
                "path": f"wiki/{'entities' if kind == 'entity' else 'concepts'}/{_slug(title)}.md",
                "title": title,
                "docKind": kind,
                "body": _topic_body(title, base_title, evidence),
                "frontmatter": _frontmatter(kind, raw, imported_at, 0.76),
            }
            for title, kind, evidence in topics
        ],
    ][:10]

    ops = [
        *create_ops,
        {
            "kind": "update_index",
            "indexPath": "wiki/sources/_index.md",
            "entries": [
                {
                    "path": op["path"],
                    "title": op["title"],
                    "docKind": op["docKind"],
                    "sourceDocIds": [raw.raw_id],
                    "action": "upsert",
                }
                for op in create_ops
            ],
        },
        {
            "kind": "append_log",
            "logPath": "wiki/log/ingest.md",
            "line": f"{imported_at} ingested {raw.uri} into {len(create_ops)} wiki nodes",
            "frontmatter": {"rawId": raw.raw_id, "sha256": raw.sha256},
        },
    ]

    return IngestPatch(
        rationale=f"Stored immutable raw {raw.raw_id} and fanned it out into {len(create_ops)} wiki nodes.",
        fanOut={
            "summary": 1,
            "entities": sum(1 for op in create_ops if op["docKind"] == "entity"),
            "concepts": sum(1 for op in create_ops if op["docKind"] == "concept"),
            "updatedExisting": 0,
        },
        ops=ops,
    )


def _raw_source(request: IngestRequest) -> RawSourceRef:
    if request.context.raw_source is not None:
        return request.context.raw_source
    text = request.context.body or _strip_ingest_verb(request.input)
    uri = _uri_from_input(request.input)
    return RawSourceRef(
        rawId=f"raw-{_hash(uri + text)}",
        uri=uri,
        mime=_mime_from_uri(uri),
        sha256=_hash(text or uri),
        bytes=len((text or uri).encode("utf-8")),
        text=text,
    )


def _uri_from_input(input_text: str) -> str:
    match = re.search(r"(?:path|url):(\S+)", input_text)
    if not match:
        return "inline://ingest"
    value = match.group(1)
    return value if value.startswith(("http://", "https://", "file://")) else f"file://{value}"


def _frontmatter(kind: str, raw: RawSourceRef, imported_at: str, confidence: float) -> dict[str, object]:
    return {
        "kind": kind,
        "sources": [raw.raw_id],
        "importedAt": imported_at,
        "confidence": confidence,
        "raw": {
            "rawId": raw.raw_id,
            "uri": raw.uri,
            "mime": raw.mime,
            "sha256": raw.sha256,
            "bytes": raw.bytes,
        },
    }


def _topics(text: str) -> list[tuple[str, str, str]]:
    sentences = [sentence.strip() for sentence in re.split(r"(?<=[.!?])\s+", text) if sentence.strip()]
    topics: list[tuple[str, str, str]] = []
    for term in _ranked_terms(text):
        evidence = next((sentence for sentence in sentences if term in _tokens(sentence)), sentences[0] if sentences else text)
        title = _title_case(term.replace("-", " "))
        topics.append((title, "concept", evidence))
    return topics


def _ranked_terms(text: str) -> list[str]:
    counts: dict[str, int] = {}
    for token in _tokens(text):
        if token in STOP_WORDS:
            continue
        counts[token] = counts.get(token, 0) + 1
    return [term for term, _count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))]


def _tokens(text: str) -> set[str]:
    return {term for term in re.split(r"[^\w]+", text.lower()) if len(term) >= 3}


def _summary_body(base_title: str, text: str, topics: list[tuple[str, str, str]]) -> str:
    links = ", ".join(f"[[{title}]]" for title, _kind, _evidence in topics[:6])
    return f"# {base_title} Summary\n\n{_truncate(' '.join(text.split()), 700)}\n\n## Derived Nodes\n\nThis source produced {links}.\n"


def _topic_body(title: str, base_title: str, evidence: str) -> str:
    return f"# {title}\n\nDerived from [[{base_title} Summary]].\n\n## Evidence\n\n{_truncate(' '.join(evidence.split()), 350)}\n"


def _strip_ingest_verb(input_text: str) -> str:
    text = re.sub(r"^/?ingest\b", "", input_text.strip(), flags=re.I)
    return re.sub(r"(?:^|\s)(?:path|url):\S+", "", text).strip()


def _title_from_uri(uri: str) -> str:
    leaf = re.split(r"[\\/]", uri.split("?")[0].split("#")[0])[-1] or "Ingested Source"
    base = re.sub(r"\.[^.]+$", "", leaf).replace("-", " ").replace("_", " ").strip()
    return _title_case(base or "Ingested Source")


def _title_case(value: str) -> str:
    return " ".join(word[:1].upper() + word[1:] for word in value.split() if word)


def _slug(value: str) -> str:
    return re.sub(r"[^\w]+", "-", value.lower(), flags=re.UNICODE).strip("-_")


def _hash(value: str) -> str:
    return f"{crc32(value.encode('utf-8')) & 0xFFFFFFFF:08x}"


def _mime_from_uri(uri: str) -> str:
    lowered = uri.lower()
    if lowered.endswith(".pdf"):
        return "application/pdf"
    if lowered.startswith("http") or lowered.endswith(".html"):
        return "text/html"
    if lowered.endswith(".png"):
        return "image/png"
    return "text/markdown"


def _truncate(value: str, max_length: int) -> str:
    return value if len(value) <= max_length else f"{value[: max_length - 1].rstrip()}..."


STOP_WORDS = {"and", "are", "for", "from", "into", "the", "this", "that", "with", "wiki", "source", "document"}
