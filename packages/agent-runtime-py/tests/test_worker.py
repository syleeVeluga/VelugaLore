import json
import os
import subprocess
import sys
import unittest


class WorkerEntrypointTest(unittest.TestCase):
    def test_worker_returns_structured_patch_json(self) -> None:
        payload = {
            "invocation": {
                "workspaceId": "11111111-1111-4111-8111-111111111111",
                "agentId": "draft",
                "input": "/draft onboarding guide",
                "context": {"docId": "doc-1", "body": ""},
            }
        }

        result = subprocess.run(
            [sys.executable, "-m", "weki_agents.worker"],
            input=json.dumps(payload),
            capture_output=True,
            check=True,
            env={**os.environ, "WEKI_AGENT_RUNTIME": "test"},
            text=True,
        )
        response = json.loads(result.stdout)

        self.assertEqual(response["model"], "test:deterministic")
        self.assertEqual(response["output"]["kind"], "Patch")
        self.assertEqual(response["output"]["outputSchema"], "DraftPatch")
        self.assertEqual(response["output"]["agentId"], "draft")

    def test_worker_supports_ingest_runtime_contract(self) -> None:
        payload = {
            "invocation": {
                "workspaceId": "11111111-1111-4111-8111-111111111111",
                "agentId": "ingest",
                "input": "/ingest path:./inbox/onboarding.md",
                "context": {
                    "rawSource": {
                        "rawId": "raw-onboarding",
                        "uri": "file://./inbox/onboarding.md",
                        "mime": "text/markdown",
                        "sha256": "abc123",
                        "bytes": 128,
                        "text": "Onboarding policy defines approvals. The checklist covers security, tools, and manager review.",
                    }
                },
            }
        }

        result = subprocess.run(
            [sys.executable, "-m", "weki_agents.worker"],
            input=json.dumps(payload),
            capture_output=True,
            check=True,
            env={**os.environ, "WEKI_AGENT_RUNTIME": "test"},
            text=True,
        )
        response = json.loads(result.stdout)
        create_docs = [op for op in response["output"]["ops"] if op["kind"] == "create_doc"]

        self.assertEqual(response["model"], "test:deterministic")
        self.assertEqual(response["output"]["kind"], "Patch")
        self.assertEqual(response["output"]["outputSchema"], "IngestPatch")
        self.assertEqual(response["output"]["agentId"], "ingest")
        self.assertGreaterEqual(len(create_docs), 3)
        self.assertLessEqual(len(create_docs), 10)


if __name__ == "__main__":
    unittest.main()
