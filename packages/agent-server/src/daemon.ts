import {
  agentRunEventSchema,
  agentRunInvocationSchema,
  type AgentOutput,
  type AgentRunEvent,
  type AgentRunInvocation
} from "@weki/core";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { InMemoryAgentRunStore, type AgentRunStore, type StoredAgentRun } from "./run-store.js";
import { ToolNotAllowedError, ToolRuntime } from "./tool-allowlist.js";

const jsonHeaders = { "content-type": "application/json; charset=utf-8" } as const;

export type AgentDaemonOptions = {
  store?: AgentRunStore;
  toolRuntime?: ToolRuntime;
};

export type AgentDaemon = {
  store: AgentRunStore;
  server: http.Server;
  runEcho(invocation: AgentRunInvocation): Promise<StoredAgentRun>;
};

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, jsonHeaders);
  response.end(JSON.stringify(body));
}

function serializeRun(run: StoredAgentRun): Record<string, unknown> {
  return {
    id: run.id,
    workspaceId: run.workspaceId,
    agentId: run.agentId,
    invokedBy: run.invokedBy,
    invocation: run.invocation,
    status: run.status,
    patch: run.patch,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString(),
    error: run.error,
    parentRunId: run.parentRunId,
    model: run.model,
    costTokens: run.costTokens,
    costUsdMicrocents: run.costUsdMicrocents?.toString()
  };
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text.length > 0 ? JSON.parse(text) : {};
}

function writeSse(response: ServerResponse, event: AgentRunEvent): void {
  const parsed = agentRunEventSchema.parse(event);
  response.write(`event: ${parsed.type}\n`);
  response.write(`data: ${JSON.stringify(parsed)}\n\n`);
}

function echoOutput(invocation: AgentRunInvocation): AgentOutput {
  return {
    kind: "ReadOnlyAnswer",
    answer: invocation.input,
    sources: []
  };
}

export function createAgentDaemon(options: AgentDaemonOptions = {}): AgentDaemon {
  const store = options.store ?? new InMemoryAgentRunStore();
  const toolRuntime = options.toolRuntime ?? new ToolRuntime({});

  async function runEcho(invocation: AgentRunInvocation): Promise<StoredAgentRun> {
    const parsedInvocation = agentRunInvocationSchema.parse(invocation);
    if (parsedInvocation.agentId !== "echo") {
      return store.create(parsedInvocation, { status: "failed", error: "UNKNOWN_AGENT" });
    }

    try {
      return await store.create(parsedInvocation, {
        status: "succeeded",
        patch: echoOutput(parsedInvocation)
      });
    } catch (error) {
      return store.create(parsedInvocation, { status: "failed", error: error instanceof Error ? error.message : "RUN_FAILED" });
    }
  }

  const server = http.createServer(async (request, response) => {
    try {
      const method = request.method ?? "GET";
      const url = new URL(request.url ?? "/", "http://127.0.0.1");

      if (method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, { status: "ok" });
        return;
      }

      if (method === "GET" && url.pathname === "/health/events") {
        response.writeHead(200, {
          "cache-control": "no-cache",
          connection: "keep-alive",
          "content-type": "text/event-stream; charset=utf-8"
        });
        writeSse(response, { type: "health", payload: { status: "ok" } });
        response.end();
        return;
      }

      if (method === "POST" && url.pathname === "/runs") {
        const body = agentRunInvocationSchema.parse(await readBody(request));
        const run = await runEcho(body);
        sendJson(response, run.status === "succeeded" ? 201 : 400, serializeRun(run));
        return;
      }

      const runMatch = url.pathname.match(/^\/runs\/([0-9a-fA-F-]{36})$/);
      if (method === "GET" && runMatch) {
        const run = await store.get(runMatch[1]);
        if (!run) {
          sendJson(response, 404, { error: "RUN_NOT_FOUND" });
          return;
        }
        sendJson(response, 200, serializeRun(run));
        return;
      }

      if (method === "POST" && url.pathname === "/tools/call") {
        const body = (await readBody(request)) as { agentId?: string; toolId?: string; input?: unknown };
        if (!body.agentId || !body.toolId) {
          sendJson(response, 400, { error: "INVALID_TOOL_CALL" });
          return;
        }
        const result = await toolRuntime.call(body.agentId, body.toolId, body.input);
        sendJson(response, 200, { result });
        return;
      }

      sendJson(response, 404, { error: "NOT_FOUND" });
    } catch (error) {
      if (error instanceof ToolNotAllowedError) {
        sendJson(response, 403, { error: error.code });
        return;
      }
      sendJson(response, 400, { error: error instanceof Error ? error.message : "BAD_REQUEST" });
    }
  });

  return { store, server, runEcho };
}
