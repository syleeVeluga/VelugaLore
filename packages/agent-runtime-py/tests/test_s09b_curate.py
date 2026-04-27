import re
import unittest
from pathlib import Path

from weki_agents import CurateRequest, create_curate_patch
from weki_agents.evals.curate import CURATE_EVAL_THRESHOLD, evaluate_curate_agent
from weki_agents.models import CuratePatch, MergeDocsOp, MoveDocOp, ReplaceRangeOp

GOLDEN_DIR = Path(__file__).parent / "curate" / "golden"
FAILURE_MODE_PATTERN = re.compile(r"^expected_failure_mode:\s*(F(?:[1-9]|10)|null)\s*$", re.MULTILINE)
DECISION_PATTERN = re.compile(r"^decision:\s*(approve|reject)\s*$", re.MULTILINE)
ID_PATTERN = re.compile(r"^id:\s*(\S+)\s*$", re.MULTILINE)


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

    def test_eval_gate_passes(self) -> None:
        result = evaluate_curate_agent()
        self.assertGreaterEqual(result.score, CURATE_EVAL_THRESHOLD)
        self.assertTrue(result.passed)

    def test_golden_corpus_meets_dod(self) -> None:
        scenarios = sorted(GOLDEN_DIR.glob("*.yaml"))
        self.assertGreaterEqual(len(scenarios), 30, "PRD 13.6.6 requires at least 30 golden scenarios")

        ids: set[str] = set()
        normals = 0
        failure_modes: set[str] = set()
        for path in scenarios:
            body = path.read_text(encoding="utf8")
            id_match = ID_PATTERN.search(body)
            self.assertIsNotNone(id_match, f"{path.name}: missing id")
            scenario_id = id_match.group(1)
            self.assertNotIn(scenario_id, ids, f"duplicate id {scenario_id}")
            ids.add(scenario_id)

            decision_match = DECISION_PATTERN.search(body)
            self.assertIsNotNone(decision_match, f"{path.name}: missing decision")
            self.assertIn("post_invariants_after_revert", body, f"{path.name}: missing post_invariants_after_revert")

            mode_match = FAILURE_MODE_PATTERN.search(body)
            self.assertIsNotNone(mode_match, f"{path.name}: missing expected_failure_mode")
            mode = mode_match.group(1)
            if mode == "null":
                normals += 1
            else:
                failure_modes.add(mode)
                self.assertIn("forbidden_ops", body, f"{path.name}: failure scenarios must declare forbidden_ops")
                self.assertEqual(decision_match.group(1), "reject", f"{path.name}: failure scenarios must reject")

        self.assertGreaterEqual(normals, 24, "PRD 13.6.6 requires at least 24 normal scenarios")
        self.assertGreaterEqual(len(failure_modes), 6, f"PRD 13.6.6 requires 6 distinct failure modes, saw {failure_modes}")


if __name__ == "__main__":
    unittest.main()
