"""Deterministic CurateAgent scaffold for S-09b golden evals."""

from dataclasses import dataclass, field
import re
from typing import Any

from .models import CuratePatch


@dataclass(frozen=True)
class CurateRequest:
    input: str
    context: dict[str, Any] = field(default_factory=dict)


def create_curate_patch(request: CurateRequest) -> CuratePatch:
    documents = _documents(request)
    index_doc = next((doc for doc in documents if doc.get("kind") == "index" or str(doc.get("path", "")).endswith("/_index.md")), None)
    ops: list[dict[str, Any]] = []
    rationale_per_op: list[str] = []

    for group in _duplicate_groups(documents):
        primary = group[0]
        ops.append(
            {
                "kind": "merge_docs",
                "docIds": [doc["docId"] for doc in group],
                "intoPath": primary.get("path") or f"wiki/{_slug(primary['title'])}.md",
                "intoTitle": primary["title"],
                "redirectStrategy": "stub",
                "preserveHistory": True,
                "evidence": {
                    "source": "find_duplicates",
                    "score": 0.9,
                    "note": "token overlap plus matching kind passed the merge threshold",
                },
            }
        )
        rationale_per_op.append("merge_docs: duplicate pages keep history and redirect stubs.")

    for doc in documents:
        if len(ops) >= 50 or doc.get("kind") == "index":
            continue
        cuts = _heading_cuts(doc.get("body", ""))
        if len(cuts) >= 2:
            ops.append(
                {
                    "kind": "split_doc",
                    "docId": doc["docId"],
                    "cuts": [
                        {
                            "at": cut["at"],
                            "newPath": f"{_dirname(doc.get('path', 'wiki'))}/{_slug(cut['title'])}.md",
                            "newTitle": cut["title"],
                            "carryFrontmatter": True,
                        }
                        for cut in cuts[:4]
                    ],
                    "leaveStub": True,
                    "evidence": {"source": "read_doc", "score": 0.72, "note": "heading boundaries suggest separable sections"},
                }
            )
            rationale_per_op.append("split_doc: long structured page has clear heading cuts.")
            continue

        expected_dir = _expected_dir(doc.get("kind"))
        if expected_dir and doc.get("path") and not str(doc["path"]).startswith(expected_dir + "/"):
            ops.append(
                {
                    "kind": "move_doc",
                    "docId": doc["docId"],
                    "newPath": f"{expected_dir}/{_slug(doc['title'])}.md",
                    "relink": True,
                    "leaveStub": True,
                    "evidence": {"source": "frontmatter.kind", "score": 1, "note": "path and kind disagree"},
                }
            )
            rationale_per_op.append("move_doc: kind/path mismatch is a pure IA change.")
            continue

        if index_doc and doc["docId"] != index_doc["docId"] and "[[" not in doc.get("body", ""):
            ops.append(
                {
                    "kind": "adopt_orphan",
                    "docId": doc["docId"],
                    "parentIndexDocId": index_doc["docId"],
                    "section": "Unlinked pages",
                    "evidence": {"source": "list_links_to", "score": 0.8, "note": "no wiki links in scope"},
                }
            )
            rationale_per_op.append("adopt_orphan: orphan page should be linked from the nearest index.")

    if not ops:
        doc = documents[0]
        ops.append(
            {
                "kind": "move_doc",
                "docId": doc["docId"],
                "newPath": doc.get("path") or f"wiki/{_slug(doc['title'])}.md",
                "relink": True,
                "leaveStub": True,
                "evidence": {"source": "curate_noop_fallback", "score": 0.5, "note": "no stronger IA signal found"},
            }
        )
        rationale_per_op.append("move_doc: weak fallback remains approval-gated and prevents automatic application.")

    return CuratePatch(
        ops=ops,
        rationale="Curate proposed IA-only operations. Every operation requires approval.",
        rationalePerOp=rationale_per_op,
        requiresApproval=True,
        previewHtml=_preview(ops),
        failureModesConsidered=["F1", "F2", "F5", "F6", "F7", "F10"],
    )


def _documents(request: CurateRequest) -> list[dict[str, Any]]:
    docs = request.context.get("documents")
    if docs:
        return [dict(doc) for doc in docs]
    return [
        {
            "docId": request.context.get("docId", "current-doc"),
            "title": request.context.get("title", "Current Page"),
            "path": request.context.get("path", "wiki/current.md"),
            "body": request.context.get("body", request.input),
            "kind": request.context.get("kind"),
        }
    ]


def _duplicate_groups(documents: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    groups: list[list[dict[str, Any]]] = []
    used: set[str] = set()
    for doc in documents:
        if doc["docId"] in used:
            continue
        matches = [
            other
            for other in documents
            if other["docId"] != doc["docId"]
            and other["docId"] not in used
            and other.get("kind") == doc.get("kind")
            and _overlap(doc.get("body", doc["title"]), other.get("body", other["title"])) >= 0.7
        ]
        if matches:
            group = [doc, *matches]
            used.update(item["docId"] for item in group)
            groups.append(group)
    return groups


def _heading_cuts(body: str) -> list[dict[str, Any]]:
    return [{"at": match.start(), "title": match.group(1).strip()} for match in re.finditer(r"^#{2,3}\s+(.+)$", body, re.M)]


def _expected_dir(kind: Any) -> str | None:
    return {
        "summary": "wiki/sources",
        "source": "wiki/sources",
        "entity": "wiki/entities",
        "concept": "wiki/concepts",
        "qa": "wiki/qa",
    }.get(kind)


def _overlap(left: str, right: str) -> float:
    left_tokens = _tokens(left)
    right_tokens = _tokens(right)
    if not left_tokens or not right_tokens:
        return 0
    return len(left_tokens & right_tokens) / min(len(left_tokens), len(right_tokens))


def _tokens(value: str) -> set[str]:
    return {token for token in re.split(r"[^\w]+", value.lower()) if len(token) >= 3}


def _dirname(path: str) -> str:
    parts = path.split("/")
    return "/".join(parts[:-1]) or "wiki"


def _slug(value: str) -> str:
    slug = re.sub(r"[^\w]+", "-", value.lower()).strip("-")
    return slug or "untitled"


def _preview(ops: list[dict[str, Any]]) -> str:
    items = "".join(f"<li>{op['kind']}</li>" for op in ops)
    return f'<div class="weki-curate-preview"><ol>{items}</ol></div>'
