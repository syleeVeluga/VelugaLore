import unittest

from weki_agents import AskRequest, ImproveRequest, create_ask_patch, create_improve_patch
from weki_agents.evals.ask import ASK_EVAL_THRESHOLD, evaluate_ask_agent
from weki_agents.evals.improve import IMPROVE_EVAL_THRESHOLD, evaluate_improve_agent
from weki_agents.models import AskPatch, ImprovePatch


class ImproveAgentTest(unittest.TestCase):
    def test_selection_returns_three_alternatives(self) -> None:
        patch = create_improve_patch(
            ImproveRequest(
                input="/improve --tone executive --maxWords 12",
                context={
                    "docId": "doc-1",
                    "body": "This is really a very important update for the team",
                    "selection": {"from": 0, "to": 52},
                },
            )
        )

        self.assertEqual(patch.output_schema, "ImprovePatch")
        self.assertEqual([op.alternative_id for op in patch.ops], ["conservative", "tonal", "concise"])
        self.assertTrue(all(len(op.text.split()) <= 12 for op in patch.ops))
        self.assertIn("concise", patch.readability_scores)

    def test_rejects_duplicate_alternatives(self) -> None:
        with self.assertRaises(ValueError):
            ImprovePatch(
                ops=[
                    {
                        "kind": "replace_range",
                        "docId": "doc-1",
                        "from": 0,
                        "to": 10,
                        "alternativeId": "conservative",
                        "label": "First",
                        "text": "One.",
                    },
                    {
                        "kind": "replace_range",
                        "docId": "doc-1",
                        "from": 0,
                        "to": 10,
                        "alternativeId": "conservative",
                        "label": "Second",
                        "text": "Two.",
                    },
                    {
                        "kind": "replace_range",
                        "docId": "doc-1",
                        "from": 0,
                        "to": 10,
                        "alternativeId": "concise",
                        "label": "Third",
                        "text": "Three.",
                    },
                ],
                readabilityScores={
                    "conservative": {"sentences": 1, "words": 1, "fkGrade": 1},
                    "tonal": {"sentences": 1, "words": 1, "fkGrade": 1},
                    "concise": {"sentences": 1, "words": 1, "fkGrade": 1},
                },
                rationale="Duplicates are invalid.",
            )

    def test_eval_gate_is_above_threshold(self) -> None:
        result = evaluate_improve_agent()

        self.assertGreaterEqual(result.score, IMPROVE_EVAL_THRESHOLD)
        self.assertTrue(result.passed)


class AskAgentTest(unittest.TestCase):
    def test_searches_sources_and_stores_qa_page(self) -> None:
        patch = create_ask_patch(
            AskRequest(
                input="/ask onboarding policy definition",
                context={
                    "documents": [
                        {
                            "docId": "doc-policy",
                            "title": "Onboarding Policy",
                            "path": "wiki/policies/onboarding.md",
                            "body": "The onboarding policy defines the first week checklist and required approvals.",
                        },
                        {
                            "docId": "doc-random",
                            "title": "Unrelated",
                            "body": "Quarterly roadmap notes.",
                        },
                    ]
                },
            )
        )

        self.assertEqual(patch.output_schema, "AskAnswerPatch")
        self.assertEqual(patch.answer.sources[0].doc_id, "doc-policy")
        self.assertIn("[[Onboarding Policy]]", patch.answer.answer_md)
        self.assertEqual(patch.ops[0].kind, "create_doc")
        self.assertEqual(patch.ops[0].doc_kind, "qa")
        self.assertEqual(patch.ops[0].path, "wiki/qa/onboarding-policy-definition-cba456b6.md")
        self.assertEqual(patch.ops[0].frontmatter.sources, ["doc-policy"])

    def test_rejects_qa_page_without_provenance_frontmatter(self) -> None:
        with self.assertRaises(ValueError):
            AskPatch(
                answer={
                    "answerMd": "Answer",
                    "confidence": 0.5,
                    "sources": [{"docId": "doc-policy", "title": "Onboarding Policy", "snippet": "Source"}],
                },
                ops=[
                    {
                        "kind": "create_doc",
                        "path": "wiki/qa/onboarding-policy-definition.md",
                        "title": "onboarding policy definition",
                        "docKind": "qa",
                        "body": "Answer",
                    }
                ],
                rationale="Missing provenance.",
            )

    def test_eval_gate_is_above_threshold(self) -> None:
        result = evaluate_ask_agent()

        self.assertGreaterEqual(result.score, ASK_EVAL_THRESHOLD)
        self.assertTrue(result.passed)


if __name__ == "__main__":
    unittest.main()
