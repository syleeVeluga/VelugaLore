import { agentOutputSchema, type AgentOutput, type AgentRunInvocation } from "@weki/core";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export const requiredProviderKeyNames = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_API_KEY"
] as const;

export const coreAgentIds = ["draft", "improve", "ask", "ingest", "curate"] as const;
export const pythonRuntimeAgentIds = ["draft", "improve", "ask", "ingest"] as const;

export type RequiredProviderKeyName = (typeof requiredProviderKeyNames)[number];
export type CoreAgentId = (typeof coreAgentIds)[number];
export type PythonRuntimeAgentId = (typeof pythonRuntimeAgentIds)[number];
export type AgentRuntimeMode = "normal" | "test";

export type AgentRuntimeConfig = {
  mode: AgentRuntimeMode;
  missingProviderKeys: RequiredProviderKeyName[];
  env: NodeJS.ProcessEnv;
};

export type ResolveAgentRuntimeConfigInput = {
  env?: NodeJS.ProcessEnv;
};

export type AgentRuntimeResult = {
  output: AgentOutput;
  model?: string;
  costTokens?: number;
  costUsdMicrocents?: bigint;
};

export type AgentRuntime = {
  run(invocation: AgentRunInvocation): Promise<AgentRuntimeResult>;
};

export type PythonAgentRuntimeOptions = {
  command?: string;
  args?: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
};

export class ProviderKeyMissingError extends Error {
  readonly code = "PROVIDER_KEY_MISSING";

  constructor(readonly missingKeys: readonly RequiredProviderKeyName[]) {
    super(
      `PROVIDER_KEY_MISSING: missing ${missingKeys.join(", ")}. ` +
        `Set OPENAI_API_KEY, ANTHROPIC_API_KEY, and GOOGLE_API_KEY for normal runtime, ` +
        `or set WEKI_AGENT_RUNTIME=test for deterministic contract tests.`
    );
    this.name = "ProviderKeyMissingError";
  }
}

export class RealLlmRuntimeNotConnectedError extends Error {
  readonly code = "REAL_LLM_RUNTIME_NOT_CONNECTED";

  constructor(agentId: string) {
    super(
      `REAL_LLM_RUNTIME_NOT_CONNECTED: provider key preflight passed, but ${agentId} is not wired to ` +
        "agent-runtime-py in this slice yet. Set WEKI_AGENT_RUNTIME=test only for deterministic contract tests."
    );
    this.name = "RealLlmRuntimeNotConnectedError";
  }
}

export class PythonAgentRuntimeError extends Error {
  readonly code = "PYTHON_AGENT_RUNTIME_FAILED";

  constructor(message: string) {
    super(`PYTHON_AGENT_RUNTIME_FAILED: ${message}`);
    this.name = "PythonAgentRuntimeError";
  }
}

export function isCoreAgentId(agentId: string): agentId is CoreAgentId {
  return (coreAgentIds as readonly string[]).includes(agentId);
}

export function isPythonRuntimeAgentId(agentId: string): agentId is PythonRuntimeAgentId {
  return (pythonRuntimeAgentIds as readonly string[]).includes(agentId);
}

export function resolveAgentRuntimeConfig(
  input: ResolveAgentRuntimeConfigInput = {}
): AgentRuntimeConfig {
  const env = input.env ?? process.env;
  const mode: AgentRuntimeMode = env.WEKI_AGENT_RUNTIME === "test" ? "test" : "normal";
  return {
    mode,
    missingProviderKeys: requiredProviderKeyNames.filter((keyName) => !env[keyName]?.trim()),
    env
  };
}

export function assertCoreAgentProviderKeysReady(agentId: string, config: AgentRuntimeConfig): void {
  if (!isCoreAgentId(agentId)) {
    return;
  }

  if (config.mode === "test") {
    return;
  }

  if (config.missingProviderKeys.length > 0) {
    throw new ProviderKeyMissingError(config.missingProviderKeys);
  }
}

export function assertCoreAgentRuntimeConnected(agentId: string, config: AgentRuntimeConfig): void {
  if (!isCoreAgentId(agentId) || config.mode === "test" || isPythonRuntimeAgentId(agentId)) {
    return;
  }

  throw new RealLlmRuntimeNotConnectedError(agentId);
}

export function createPythonAgentRuntime(options: PythonAgentRuntimeOptions = {}): AgentRuntime {
  return {
    run(invocation) {
      return runPythonAgentRuntime(invocation, options);
    }
  };
}

async function runPythonAgentRuntime(
  invocation: AgentRunInvocation,
  options: PythonAgentRuntimeOptions
): Promise<AgentRuntimeResult> {
  const command = options.command ?? process.env.WEKI_AGENT_RUNTIME_PYTHON ?? "python";
  const args = [...(options.args ?? ["-m", "weki_agents.worker"])];
  const cwd = options.cwd ?? findAgentRuntimePyPackageDir(process.cwd());
  const env = pythonRuntimeEnv(options.env ?? process.env, cwd);
  const payload = JSON.stringify({ invocation });
  const timeoutMs = options.timeoutMs ?? 60_000;

  return new Promise<AgentRuntimeResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill();
      reject(new PythonAgentRuntimeError(`timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(new PythonAgentRuntimeError(error.message));
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);

      if (code !== 0) {
        reject(new PythonAgentRuntimeError(trimRuntimeText(stderr) || `worker exited with code ${code}`));
        return;
      }

      try {
        resolve(parsePythonAgentRuntimeResponse(stdout));
      } catch (error) {
        reject(error);
      }
    });

    child.stdin.end(`${payload}\n`);
  });
}

function parsePythonAgentRuntimeResponse(stdout: string): AgentRuntimeResult {
  const parsed = JSON.parse(stdout) as {
    output?: unknown;
    model?: string;
    costTokens?: number;
    costUsdMicrocents?: string | number;
    error?: string;
  };

  if (parsed.error) {
    throw new PythonAgentRuntimeError(parsed.error);
  }
  if (!parsed.output) {
    throw new PythonAgentRuntimeError("worker response did not include output");
  }

  return {
    output: agentOutputSchema.parse(parsed.output),
    model: parsed.model,
    costTokens: parsed.costTokens,
    costUsdMicrocents:
      parsed.costUsdMicrocents === undefined ? undefined : BigInt(parsed.costUsdMicrocents)
  };
}

function pythonRuntimeEnv(base: NodeJS.ProcessEnv, cwd: string): NodeJS.ProcessEnv {
  const srcPath = path.join(cwd, "src");
  const existingPythonPath = base.PYTHONPATH;
  return {
    ...base,
    PYTHONPATH: existingPythonPath ? `${srcPath}${path.delimiter}${existingPythonPath}` : srcPath
  };
}

function findAgentRuntimePyPackageDir(start: string): string {
  let current = path.resolve(start);

  while (true) {
    const candidate = path.join(current, "packages", "agent-runtime-py");
    if (existsSync(path.join(candidate, "pyproject.toml"))) {
      return candidate;
    }

    if (existsSync(path.join(current, "pyproject.toml")) && path.basename(current) === "agent-runtime-py") {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return start;
    }
    current = parent;
  }
}

function trimRuntimeText(value: string): string {
  return value.trim().split(/\r?\n/).slice(-10).join("\n");
}
