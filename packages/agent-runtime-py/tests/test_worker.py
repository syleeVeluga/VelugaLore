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


if __name__ == "__main__":
    unittest.main()
