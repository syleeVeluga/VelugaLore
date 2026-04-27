import unittest

from weki_agents import IngestRequest, create_ingest_patch
from weki_agents.evals.ingest import INGEST_EVAL_THRESHOLD, evaluate_ingest_agent
from weki_agents.models import AppendLogOp, IngestCreateDocOp, IngestPatch


class IngestAgentTest(unittest.TestCase):
    def test_raw_source_fans_out_to_derived_wiki_nodes(self) -> None:
        patch = create_ingest_patch(
            IngestRequest(
                input="/ingest path:./inbox/onboarding.md",
                context={
                    "rawSource": {
                        "rawId": "raw-onboarding",
                        "uri": "file://./inbox/onboarding.md",
                        "mime": "text/markdown",
                        "sha256": "abc123",
                        "bytes": 128,
                        "text": "Onboarding policy defines approvals. The checklist covers security, tools, and manager review.",
                    }
                },
            )
        )

        create_docs = [op for op in patch.ops if isinstance(op, IngestCreateDocOp)]
        self.assertEqual(patch.output_schema, "IngestPatch")
        self.assertGreaterEqual(len(create_docs), 3)
        self.assertLessEqual(len(create_docs), 10)
        self.assertTrue(any(op.doc_kind == "summary" for op in create_docs))
        self.assertTrue(all("raw-onboarding" in op.frontmatter.sources for op in create_docs))
        self.assertTrue(any(isinstance(op, AppendLogOp) for op in patch.ops))

    def test_non_latin_topic_paths_are_not_empty(self) -> None:
        patch = create_ingest_patch(
            IngestRequest(
                input="/ingest path:./inbox/자료.md",
                context={
                    "rawSource": {
                        "rawId": "raw-korean",
                        "uri": "file://./inbox/자료.md",
                        "mime": "text/markdown",
                        "sha256": "abc123",
                        "bytes": 128,
                        "text": "온보딩 정책은 승인 절차를 정의합니다. 보안 체크리스트는 도구 검토를 포함합니다.",
                    }
                },
            )
        )

        paths = [op.path for op in patch.ops if isinstance(op, IngestCreateDocOp)]

        self.assertTrue(all(not path.endswith("/.md") for path in paths))
        self.assertTrue(any("온보딩" in path or "자료" in path for path in paths))

    def test_rejects_single_node_ingest_output(self) -> None:
        with self.assertRaises(ValueError):
            IngestPatch(
                ops=[
                    {
                        "kind": "create_doc",
                        "path": "wiki/sources/raw.md",
                        "title": "Raw Summary",
                        "docKind": "summary",
                        "body": "# Raw Summary",
                        "frontmatter": {
                            "kind": "summary",
                            "sources": ["raw-1"],
                            "importedAt": "2026-04-27T00:00:00.000Z",
                            "confidence": 0.8,
                        },
                    },
                    {"kind": "append_log", "line": "logged"},
                ],
                fanOut={"summary": 1, "entities": 0, "concepts": 0, "updatedExisting": 0},
                rationale="Too little fan-out.",
            )

    def test_rejects_multiple_summary_documents(self) -> None:
        frontmatter = {
            "sources": ["raw-1"],
            "importedAt": "2026-04-27T00:00:00.000Z",
            "confidence": 0.8,
        }

        with self.assertRaisesRegex(ValueError, "exactly one summary"):
            IngestPatch(
                ops=[
                    {
                        "kind": "create_doc",
                        "path": "wiki/sources/raw.md",
                        "title": "Raw Summary",
                        "docKind": "summary",
                        "body": "# Raw Summary",
                        "frontmatter": {**frontmatter, "kind": "summary"},
                    },
                    {
                        "kind": "create_doc",
                        "path": "wiki/sources/raw-copy.md",
                        "title": "Raw Copy Summary",
                        "docKind": "summary",
                        "body": "# Raw Copy Summary",
                        "frontmatter": {**frontmatter, "kind": "summary"},
                    },
                    {
                        "kind": "create_doc",
                        "path": "wiki/concepts/policy.md",
                        "title": "Policy",
                        "docKind": "concept",
                        "body": "# Policy",
                        "frontmatter": {**frontmatter, "kind": "concept"},
                    },
                    {"kind": "append_log", "line": "logged"},
                ],
                fanOut={"summary": 1, "entities": 0, "concepts": 1, "updatedExisting": 0},
                rationale="Duplicate summaries should not validate.",
            )

    def test_eval_gate_is_above_threshold(self) -> None:
        result = evaluate_ingest_agent()

        self.assertGreaterEqual(result.score, INGEST_EVAL_THRESHOLD)
        self.assertTrue(result.passed)


if __name__ == "__main__":
    unittest.main()
