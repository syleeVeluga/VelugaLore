import { afterEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  createAgentDaemon,
  InMemoryAgentRunStore,
  runDraftAgent,
  SqlAgentRunStore,
  ToolRuntime,
  type AgentRunStore,
  type StoredAgentRun
} from "./index.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";

async function listen(server: ReturnType<typeof createAgentDaemon>["server"]): Promise<string> {
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected TCP listener address");
  }
  return `http://127.0.0.1:${address.port}`;
}

describe("S-05 agent daemon", () => {
  const servers: ReturnType<typeof createAgentDaemon>["server"][] = [];

  afterEach(async () => {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            if (!server.listening) {
              resolve();
              return;
            }
            server.close((error) => (error ? reject(error) : resolve()));
          })
      )
    );
    servers.length = 0;
  });

  it("serves HTTP and SSE healthchecks", async () => {
    const daemon = createAgentDaemon();
    servers.push(daemon.server);
    const baseUrl = await listen(daemon.server);

    const health = await fetch(`${baseUrl}/health`);
    await expect(health.json()).resolves.toEqual({ status: "ok" });

    const events = await fetch(`${baseUrl}/health/events`);
    const body = await events.text();
    expect(events.headers.get("content-type")).toContain("text/event-stream");
    expect(body).toContain("event: health");
    expect(body).toContain('"status":"ok"');
  });

  it("runs echo and persists the run for later reads", async () => {
    const daemon = createAgentDaemon({ store: new InMemoryAgentRunStore() });
    servers.push(daemon.server);
    const baseUrl = await listen(daemon.server);

    const created = await fetch(`${baseUrl}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId, agentId: "echo", input: "ping" })
    });
    const run = (await created.json()) as { id: string; status: string; patch: { answer: string } };

    expect(created.status).toBe(201);
    expect(run.status).toBe("succeeded");
    expect(run.patch.answer).toBe("ping");

    const fetched = await fetch(`${baseUrl}/runs/${run.id}`);
    await expect(fetched.json()).resolves.toMatchObject({
      id: run.id,
      workspaceId,
      agentId: "echo",
      status: "succeeded",
      patch: { kind: "ReadOnlyAnswer", answer: "ping" }
    });
  });

  it("runs DraftAgent for an empty document and returns a DraftPatch", async () => {
    const daemon = createAgentDaemon({ store: new InMemoryAgentRunStore() });
    servers.push(daemon.server);
    const baseUrl = await listen(daemon.server);

    const created = await fetch(`${baseUrl}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        agentId: "draft",
        input: "/draft onboarding guide --audience editors",
        context: { docId: "doc-1", body: "" }
      })
    });
    const run = (await created.json()) as {
      status: string;
      patch: { outputSchema: string; ops: Array<{ kind: string; sectionHeading?: string }> };
    };

    expect(created.status).toBe(201);
    expect(run.status).toBe("succeeded");
    expect(run.patch.outputSchema).toBe("DraftPatch");
    expect(run.patch.ops[0]?.kind).toBe("insert_section_tree");
    expect(run.patch.ops.filter((op) => op.kind === "append_paragraph")).toHaveLength(5);
  });

  it("runs DraftAgent for a selection and proposes one replace_range op", () => {
    const patch = runDraftAgent({
      workspaceId,
      agentId: "draft",
      input: "/draft launch note --audience executives",
      context: {
        docId: "doc-1",
        body: "Intro\nShort note.\nEnd",
        selection: { from: 6, to: 17 }
      }
    });

    expect(patch.outputSchema).toBe("DraftPatch");
    expect(patch.ops).toHaveLength(1);
    expect(patch.ops[0]).toMatchObject({
      kind: "replace_range",
      docId: "doc-1",
      from: 6,
      to: 17
    });
    expect(patch.ops[0]?.kind === "replace_range" ? patch.ops[0].text : "").toContain("executives");
  });

  it("fails tool calls closed when an agent has no explicit allowlist entry", async () => {
    const runtime = new ToolRuntime({
      read_doc: () => ({ body: "secret" })
    });

    await expect(runtime.call("unlisted-agent", "read_doc", {})).rejects.toMatchObject({
      code: "TOOL_NOT_ALLOWED"
    });
  });

  it("allows DraftAgent to call its read-only context tools only", async () => {
    const runtime = new ToolRuntime({
      read_doc: () => ({ body: "workspace context" }),
      web_fetch: () => ({ body: "external" })
    });

    await expect(runtime.call("draft", "read_doc", {})).resolves.toEqual({ body: "workspace context" });
    await expect(runtime.call("draft", "web_fetch", {})).rejects.toMatchObject({
      code: "TOOL_NOT_ALLOWED"
    });
  });

  it("returns 403 for denied HTTP tool calls", async () => {
    const daemon = createAgentDaemon({
      toolRuntime: new ToolRuntime({ read_doc: () => ({ body: "secret" }) })
    });
    servers.push(daemon.server);
    const baseUrl = await listen(daemon.server);

    const response = await fetch(`${baseUrl}/tools/call`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId: "echo", toolId: "read_doc", input: {} })
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "TOOL_NOT_ALLOWED" });
  });

  it("provides a SQL-backed agent_runs store for Postgres persistence", async () => {
    const queries: { sql: string; values?: unknown[] }[] = [];
    const invocation = { workspaceId, agentId: "echo", input: "persist me" };
    const row = {
      id: "22222222-2222-4222-8222-222222222222",
      workspace_id: workspaceId,
      agent_id: "echo",
      invoked_by: null,
      invocation,
      status: "running" as const,
      patch: null,
      started_at: new Date("2026-04-26T00:00:00.000Z"),
      finished_at: null,
      error: null,
      parent_run_id: null,
      model: null,
      cost_tokens: null,
      cost_usd_microcents: null
    };
    const store = new SqlAgentRunStore({
      async query<Row>(sql: string, values?: unknown[]) {
        queries.push({ sql, values });
        return {
          rows: [
            {
              ...row,
              status: "succeeded" as const,
              patch: { kind: "ReadOnlyAnswer" as const, answer: "persist me", sources: [] },
              finished_at: new Date("2026-04-26T00:00:01.000Z")
            }
          ] as Row[]
        };
      }
    });

    const created = await store.create(invocation, {
      status: "succeeded",
      patch: { kind: "ReadOnlyAnswer", answer: "persist me", sources: [] }
    });

    expect(created.status).toBe("succeeded");
    expect(queries[0]?.sql).toContain("INSERT INTO agent_runs");
    expect(queries[0]?.sql).toContain("patch");
    expect(queries).toHaveLength(1);
  });

  it("returns 400 for malformed JSON request bodies", async () => {
    const daemon = createAgentDaemon({ store: new InMemoryAgentRunStore() });
    servers.push(daemon.server);
    const baseUrl = await listen(daemon.server);

    const response = await fetch(`${baseUrl}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json"
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
    expect(body.error).not.toBe("INTERNAL_ERROR");
  });

  it("returns 400 for schema-invalid run invocations", async () => {
    const daemon = createAgentDaemon({ store: new InMemoryAgentRunStore() });
    servers.push(daemon.server);
    const baseUrl = await listen(daemon.server);

    const response = await fetch(`${baseUrl}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: "not-a-uuid", agentId: "echo" })
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(typeof body.error).toBe("string");
    expect(body.error).not.toBe("INTERNAL_ERROR");
    expect(body.error.toLowerCase()).toContain("uuid");
  });

  it("returns 500 INTERNAL_ERROR when an unexpected store failure escapes", async () => {
    const failingStore: AgentRunStore = {
      async create(): Promise<StoredAgentRun> {
        throw new Error("create not used");
      },
      async finish(): Promise<StoredAgentRun> {
        throw new Error("finish not used");
      },
      async get(): Promise<StoredAgentRun | undefined> {
        throw new Error("kaboom");
      }
    };
    const daemon = createAgentDaemon({ store: failingStore });
    servers.push(daemon.server);
    const baseUrl = await listen(daemon.server);

    const response = await fetch(`${baseUrl}/runs/22222222-2222-4222-8222-222222222222`);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "INTERNAL_ERROR" });
  });

  it("clears patch and sets error on SqlAgentRunStore.finish for failed transitions", async () => {
    const queries: { sql: string; values?: unknown[] }[] = [];
    const id = "33333333-3333-4333-8333-333333333333";
    const store = new SqlAgentRunStore({
      async query<Row>(sql: string, values?: unknown[]) {
        queries.push({ sql, values });
        return {
          rows: [
            {
              id,
              workspace_id: workspaceId,
              agent_id: "echo",
              invoked_by: null,
              invocation: { workspaceId, agentId: "echo", input: "" },
              status: "failed" as const,
              patch: null,
              started_at: new Date("2026-04-26T00:00:00.000Z"),
              finished_at: new Date("2026-04-26T00:00:01.000Z"),
              error: "BOOM",
              parent_run_id: null,
              model: null,
              cost_tokens: null,
              cost_usd_microcents: null
            }
          ] as Row[]
        };
      }
    });

    const finished = await store.finish({ id, status: "failed", error: "BOOM" });

    expect(finished.status).toBe("failed");
    expect(finished.patch).toBeUndefined();
    expect(finished.error).toBe("BOOM");
    const update = queries[0];
    expect(update?.sql).toContain("UPDATE agent_runs");
    expect(update?.sql).toContain("patch = CASE WHEN $2 = 'failed' THEN NULL ELSE patch END");
    expect(update?.values).toEqual([id, "failed", "BOOM"]);
  });

  it("clears error on SqlAgentRunStore.finish for succeeded transitions", async () => {
    const queries: { sql: string; values?: unknown[] }[] = [];
    const id = "44444444-4444-4444-8444-444444444444";
    const store = new SqlAgentRunStore({
      async query<Row>(sql: string, values?: unknown[]) {
        queries.push({ sql, values });
        return {
          rows: [
            {
              id,
              workspace_id: workspaceId,
              agent_id: "echo",
              invoked_by: null,
              invocation: { workspaceId, agentId: "echo", input: "" },
              status: "succeeded" as const,
              patch: { kind: "ReadOnlyAnswer" as const, answer: "ok", sources: [] },
              started_at: new Date("2026-04-26T00:00:00.000Z"),
              finished_at: new Date("2026-04-26T00:00:01.000Z"),
              error: null,
              parent_run_id: null,
              model: null,
              cost_tokens: null,
              cost_usd_microcents: null
            }
          ] as Row[]
        };
      }
    });

    const finished = await store.finish({ id, status: "succeeded" });

    expect(finished.status).toBe("succeeded");
    expect(finished.error).toBeUndefined();
    const update = queries[0];
    expect(update?.sql).toContain("error = $3");
    expect(update?.values).toEqual([id, "succeeded", null]);
  });

  it("clears stale patch when InMemoryAgentRunStore transitions succeeded -> failed", async () => {
    const store = new InMemoryAgentRunStore();
    const created = await store.create(
      { workspaceId, agentId: "echo", input: "ping" },
      { status: "succeeded", patch: { kind: "ReadOnlyAnswer", answer: "ping", sources: [] } }
    );
    expect(created.patch).toBeDefined();

    const finished = await store.finish({ id: created.id, status: "failed", error: "BOOM" });

    expect(finished.status).toBe("failed");
    expect(finished.patch).toBeUndefined();
    expect(finished.error).toBe("BOOM");

    const fetched = await store.get(created.id);
    expect(fetched?.patch).toBeUndefined();
    expect(fetched?.error).toBe("BOOM");
  });

  it("clears stale error when InMemoryAgentRunStore transitions failed -> succeeded", async () => {
    const store = new InMemoryAgentRunStore();
    const created = await store.create(
      { workspaceId, agentId: "echo", input: "ping" },
      { status: "failed", error: "BOOM" }
    );
    expect(created.error).toBe("BOOM");

    const finished = await store.finish({ id: created.id, status: "succeeded" });

    expect(finished.status).toBe("succeeded");
    expect(finished.error).toBeUndefined();

    const fetched = await store.get(created.id);
    expect(fetched?.status).toBe("succeeded");
    expect(fetched?.error).toBeUndefined();
  });

  it("does not declare an opencode dependency", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect({
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    }).not.toHaveProperty("opencode");
  });
});
