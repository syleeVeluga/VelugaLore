import { afterEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { createAgentDaemon, InMemoryAgentRunStore, runDraftAgent, SqlAgentRunStore, ToolRuntime } from "./index.js";

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
