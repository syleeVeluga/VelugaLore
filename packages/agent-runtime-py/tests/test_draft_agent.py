import unittest

from weki_agents import DraftRequest, create_draft_patch
from weki_agents.evals.draft import DRAFT_EVAL_THRESHOLD, evaluate_draft_agent


class DraftAgentTest(unittest.TestCase):
    def test_empty_doc_creates_outline_and_draft(self) -> None:
        patch = create_draft_patch(
            DraftRequest(input="/draft onboarding guide --audience editors", context={"docId": "doc-1", "body": ""})
        )

        self.assertEqual(patch.output_schema, "DraftPatch")
        self.assertEqual(patch.ops[0].kind, "insert_section_tree")
        self.assertEqual(sum(1 for op in patch.ops if op.kind == "append_paragraph"), 5)

    def test_selection_expands_with_replace_range(self) -> None:
        patch = create_draft_patch(
            DraftRequest(
                input="/draft launch note --audience executives",
                context={
                    "docId": "doc-1",
                    "body": "Intro\nShort note.\nEnd",
                    "selection": {"from": 6, "to": 17},
                },
            )
        )

        self.assertEqual(len(patch.ops), 1)
        op = patch.ops[0]
        self.assertEqual(op.kind, "replace_range")
        self.assertIn("executives", op.text)
        self.assertIn("Short note.", op.text)

    def test_eval_gate_is_above_threshold(self) -> None:
        result = evaluate_draft_agent()

        self.assertGreaterEqual(result.score, DRAFT_EVAL_THRESHOLD)
        self.assertTrue(result.passed)

    def test_serializes_with_core_schema_aliases_by_default(self) -> None:
        patch = create_draft_patch(
            DraftRequest(input="/draft onboarding guide", context={"docId": "doc-1", "body": ""})
        )

        dumped = patch.model_dump()
        self.assertEqual(dumped["outputSchema"], "DraftPatch")
        self.assertEqual(dumped["agentId"], "draft")
        self.assertTrue(dumped["requiresApproval"])
        self.assertEqual(dumped["ops"][0]["docId"], "doc-1")
        self.assertEqual(dumped["ops"][1]["sectionHeading"], "Context")
        self.assertNotIn("output_schema", dumped)


if __name__ == "__main__":
    unittest.main()
