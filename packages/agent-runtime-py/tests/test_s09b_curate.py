import unittest
from pathlib import Path

from weki_agents import CurateRequest, create_curate_patch
from weki_agents.evals.curate import CURATE_EVAL_THRESHOLD, evaluate_curate_agent
from weki_agents.models import CuratePatch, MergeDocsOp, MoveDocOp, ReplaceRangeOp


class CurateAgentTest(unittest.TestCase):
    def test_curate_proposes_ia_ops_only_and_requires_approval(self) -> None:
        patch = create_curate_patch(
            CurateRequest(
                input="/curate scope:wiki/policies",
                context={
                    "documents": [
                        {"docId": "index", "title": "Policies", "path": "wiki/policies/_index.md", "body": "# Policies", "kind": "index"},
                        {
                            "docId": "dup-a",
                            "title": "Onboarding Policy",
                            "path": "wiki/policies/onboarding.md",
                            "body": "# Onboarding\n\nAccess approval manager review security checklist.",
                            "kind": "concept",
                        },
                        {
                            "docId": "dup-b",
                            "title": "Onboarding Checklist",
                            "path": "wiki/policies/onboarding-checklist.md",
                            "body": "# Onboarding\n\nAccess approval manager review security checklist.",
                            "kind": "concept",
                        },
                        {
                            "docId": "misfiled",
                            "title": "Security",
                            "path": "wiki/policies/security.md",
                            "body": "# Security\n\n[[Policies]]",
                            "kind": "concept",
                        },
                    ]
                },
            )
        )

        self.assertEqual(patch.output_schema, "CuratePatch")
        self.assertTrue(patch.requires_approval)
        self.assertTrue(all(op.kind in {"split_doc", "merge_docs", "move_doc", "adopt_orphan"} for op in patch.ops))
        self.assertTrue(any(isinstance(op, MergeDocsOp) for op in patch.ops))
        self.assertTrue(any(isinstance(op, MoveDocOp) for op in patch.ops))

    def test_rejects_prose_edit_models_in_curate_patch(self) -> None:
        prose_op = ReplaceRangeOp(kind="replace_range", docId="doc-1", **{"from": 0}, to=1, text="x")
        with self.assertRaises(ValueError):
            CuratePatch(
                ops=[prose_op],
                rationale="Invalid prose edit.",
                rationalePerOp=["replace_range is not allowed."],
                requiresApproval=True,
            )

    def test_eval_gate_and_yaml_golden_failure_modes_exist(self) -> None:
        result = evaluate_curate_agent()
        golden_dir = Path(__file__).parent / "curate" / "golden"
        golden_text = "\n".join(path.read_text(encoding="utf8") for path in golden_dir.glob("*.yaml"))

        self.assertGreaterEqual(result.score, CURATE_EVAL_THRESHOLD)
        self.assertTrue(result.passed)
        self.assertIn("expected_failure_mode: F2", golden_text)
        self.assertIn("post_invariants_after_revert", golden_text)


if __name__ == "__main__":
    unittest.main()
