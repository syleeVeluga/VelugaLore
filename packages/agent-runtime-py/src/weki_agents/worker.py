"""JSON subprocess entrypoint for the TypeScript agent-server runtime."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, Callable

from pydantic import BaseModel

from .ask import AskRequest, create_ask_patch
from .draft import DraftRequest, create_draft_patch
from .improve import ImproveRequest, create_improve_patch
from .models import AskPatch, DraftPatch, ImprovePatch

DEFAULT_MODEL = "google-gla:gemini-2.5-flash-lite"
TEST_MODEL = "test:deterministic"


class WorkerInvocation(BaseModel):
    invocation: dict[str, Any]


def main() -> int:
    try:
        payload = WorkerInvocation.model_validate_json(sys.stdin.read())
        invocation = payload.invocation
        agent_id = invocation.get("agentId")
        output, metadata = _run_agent(agent_id, invocation)
        sys.stdout.write(
            json.dumps(
                {
                    "output": output.model_dump(),
                    **metadata,
                },
                ensure_ascii=False,
            )
        )
        sys.stdout.write("\n")
        return 0
    except Exception as exc:
        sys.stderr.write(f"{type(exc).__name__}: {exc}\n")
        return 1


def _run_agent(agent_id: Any, invocation: dict[str, Any]) -> tuple[BaseModel, dict[str, Any]]:
    if os.environ.get("WEKI_AGENT_RUNTIME") == "test":
        return _run_deterministic_agent(agent_id, invocation), {"model": TEST_MODEL}
    return _run_live_agent(agent_id, invocation)


def _run_deterministic_agent(agent_id: Any, invocation: dict[str, Any]) -> BaseModel:
    runners: dict[str, tuple[type[BaseModel], Callable[[Any], BaseModel]]] = {
        "draft": (DraftRequest, create_draft_patch),
        "improve": (ImproveRequest, create_improve_patch),
        "ask": (AskRequest, create_ask_patch),
    }
    request_type, runner = runners.get(str(agent_id), (None, None))  # type: ignore[assignment]
    if request_type is None or runner is None:
        raise ValueError(f"UNSUPPORTED_AGENT_RUNTIME: {agent_id}")
    request = request_type.model_validate(
        {
            "input": invocation.get("input", ""),
            "context": invocation.get("context") or {},
        }
    )
    return runner(request)


def _run_live_agent(agent_id: Any, invocation: dict[str, Any]) -> tuple[BaseModel, dict[str, Any]]:
    output_types: dict[str, type[BaseModel]] = {
        "draft": DraftPatch,
        "improve": ImprovePatch,
        "ask": AskPatch,
    }
    output_type = output_types.get(str(agent_id))
    if output_type is None:
        raise ValueError(f"UNSUPPORTED_AGENT_RUNTIME: {agent_id}")

    try:
        from pydantic_ai import Agent
    except ImportError as exc:
        raise RuntimeError("PYDANTIC_AI_NOT_INSTALLED") from exc

    agent = Agent(
        DEFAULT_MODEL,
        output_type=output_type,
        instructions=_instructions(str(agent_id)),
    )
    result = agent.run_sync(_user_prompt(invocation))
    metadata: dict[str, Any] = {"model": DEFAULT_MODEL}
    usage = result.usage()
    token_count = _token_count(usage)
    if token_count is not None:
        metadata["costTokens"] = token_count
    return result.output, metadata


def _instructions(agent_id: str) -> str:
    prompt_path = Path.cwd() / "prompts" / f"{agent_id}.md"
    prompt = prompt_path.read_text(encoding="utf-8") if prompt_path.exists() else ""
    contract = (
        "Return a single VelugaLore structured output that validates against the requested Pydantic model. "
        "Agent outputs are proposals only: use Patch or ReadOnlyAnswer contracts and never claim to mutate files directly. "
        "Patch outputs must keep requiresApproval=true."
    )
    return f"{prompt}\n\n{contract}".strip()


def _user_prompt(invocation: dict[str, Any]) -> str:
    return json.dumps(
        {
            "agentId": invocation.get("agentId"),
            "input": invocation.get("input", ""),
            "context": invocation.get("context") or {},
        },
        ensure_ascii=False,
    )


def _token_count(usage: Any) -> int | None:
    total = int(getattr(usage, "input_tokens", 0) or 0) + int(getattr(usage, "output_tokens", 0) or 0)
    return total or None


if __name__ == "__main__":
    raise SystemExit(main())
