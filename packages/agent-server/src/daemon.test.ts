import { afterEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  createAgentDaemon,
  InMemoryAgentRunStore,
  InMemoryPatchApprovalStore,
  PatchDecisionDeniedError,
  applyAgentSessionSqlContext,
  runDraftAgent,
  runIngestAgent,
  resolveAgentSessionContext,
  SqlAgentRunStore,
  SqlPatchApprovalStore,
  ToolRuntime,
  type AgentRuntime,
  type AgentRunStore,
  type StoredAgentRun
} from "./index.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const deterministicRuntime = {
  runtime: { env: { WEKI_AGENT_RUNTIME: "test" } as NodeJS.ProcessEnv }
};

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

  it("resolves Solo session identity and strips act-as in production", () => {
    expect(
      resolveAgentSessionContext({
        env: {
          WEKI_SOLO_USER_ID: "55555555-5555-4555-8555-555555555555",
          WEKI_DEV_AS_ROLE: "reader",
          NODE_ENV: "development"
        } as NodeJS.ProcessEnv
      })
    ).toEqual({
      userId: "55555555-5555-4555-8555-555555555555",
      actedAsRole: "reader"
    });

    expect(
      resolveAgentSessionContext({
        env: {
          WEKI_SOLO_USER_ID: "55555555-5555-4555-8555-555555555555",
          WEKI_DEV_AS_ROLE: "owner",
          NODE_ENV: "production"
        } as NodeJS.ProcessEnv
      })
    ).toEqual({
      userId: "55555555-5555-4555-8555-555555555555",
      actedAsRole: undefined
    });
  });

  it("applies app.user_id and dev role override to the SQL session context", async () => {
    const queries: { sql: string; values?: unknown[] }[] = [];
    await applyAgentSessionSqlContext(
      {
        async query<Row>(sql: string, values?: unknown[]) {
          queries.push({ sql, values });
          return { rows: [] as Row[] };
        }
      },
      { userId: "55555555-5555-4555-8555-555555555555", actedAsRole: "admin" }
    );

    expect(queries).toEqual([
      { sql: "SELECT set_config('app.user_id', $1, false)", values: ["55555555-5555-4555-8555-555555555555"] },
      { sql: "SELECT set_config('app.dev_act_as_enabled', $1, false)", values: ["true"] },
      { sql: "SELECT set_config('app.role_override', $1, false)", values: ["admin"] }
    ]);
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
    expect((await daemon.store.get(run.id))?.invokedBy).toBe("00000000-0000-4000-8000-000000000001");
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
    const approvalStore = new InMemoryPatchApprovalStore();
    const daemon = createAgentDaemon({ store: new InMemoryAgentRunStore(), approvalStore, ...deterministicRuntime });
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

    const queued = await approvalStore.list({ status: "proposed" });
    expect(queued).toHaveLength(1);
    expect(queued[0]?.previewHtml).toContain("weki-patch-preview");
  });

  it("fails core agents in normal runtime when any required provider key is missing", async () => {
    const approvalStore = new InMemoryPatchApprovalStore();
    const daemon = createAgentDaemon({
      store: new InMemoryAgentRunStore(),
      approvalStore,
      runtime: {
        env: {
          OPENAI_API_KEY: "openai-test-key",
          ANTHROPIC_API_KEY: "anthropic-test-key"
        } as NodeJS.ProcessEnv
      }
    });

    const run = await daemon.runAgent({
      workspaceId,
      agentId: "draft",
      input: "/draft onboarding guide",
      context: { docId: "doc-1", body: "" }
    });

    expect(run.status).toBe("failed");
    expect(run.error).toContain("PROVIDER_KEY_MISSING");
    expect(run.error).toContain("GOOGLE_API_KEY");
    await expect(approvalStore.list({ status: "proposed", workspaceId })).resolves.toHaveLength(0);
  });

  it("delegates draft to the configured runtime in normal mode after provider preflight passes", async () => {
    const approvalStore = new InMemoryPatchApprovalStore();
    let calls = 0;
    const worker: AgentRuntime = {
      async run(invocation) {
        calls += 1;
        return {
          model: "google-gla:gemini-2.5-flash-lite",
          costTokens: 42,
          costUsdMicrocents: 100n,
          output: {
            kind: "Patch",
            outputSchema: "DraftPatch",
            agentId: "draft",
            ops: [
              {
                kind: "append_paragraph",
                docId: invocation.context?.docId,
                sectionHeading: "Draft",
                text: "Runtime generated draft content."
              }
            ],
            rationale: "Generated by the injected runtime.",
            requiresApproval: true,
            assumptions: []
          }
        };
      }
    };
    const daemon = createAgentDaemon({
      store: new InMemoryAgentRunStore(),
      approvalStore,
      runtime: {
        env: {
          OPENAI_API_KEY: "openai-test-key",
          ANTHROPIC_API_KEY: "anthropic-test-key",
          GOOGLE_API_KEY: "google-test-key"
        } as NodeJS.ProcessEnv,
        worker
      }
    });

    const run = await daemon.runAgent({
      workspaceId,
      agentId: "draft",
      input: "/draft onboarding guide",
      context: { docId: "doc-1", body: "" }
    });

    expect(run.status).toBe("succeeded");
    expect(calls).toBe(1);
    expect(run.model).toBe("google-gla:gemini-2.5-flash-lite");
    expect(run.costTokens).toBe(42);
    expect(run.costUsdMicrocents).toBe(100n);
    expect(run.patch).toMatchObject({ agentId: "draft", rationale: "Generated by the injected runtime." });
    await expect(approvalStore.list({ status: "proposed", workspaceId })).resolves.toHaveLength(1);
  });

  it("exposes proposed patches and records keyboard-driven approval decisions over HTTP", async () => {
    const approvalStore = new InMemoryPatchApprovalStore();
    const sessionUserId = "55555555-5555-4555-8555-555555555555";
    const daemon = createAgentDaemon({
      store: new InMemoryAgentRunStore(),
      approvalStore,
      session: { userId: sessionUserId },
      ...deterministicRuntime
    });
    servers.push(daemon.server);
    const baseUrl = await listen(daemon.server);

    await fetch(`${baseUrl}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        agentId: "draft",
        input: "/draft onboarding guide",
        invokedBy: "55555555-5555-4555-8555-555555555555",
        context: { docId: "doc-1", body: "" }
      })
    });

    const list = await fetch(`${baseUrl}/patches?status=proposed`);
    const listBody = (await list.json()) as { patches: Array<{ id: string; status: string }> };
    expect(listBody.patches).toHaveLength(1);
    expect(listBody.patches[0]?.status).toBe("proposed");

    const decided = await fetch(`${baseUrl}/patches/${listBody.patches[0]?.id}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        decision: "applied",
        decidedBy: "99999999-9999-4999-8999-999999999999",
        rationale: "Accepted from keyboard shortcut."
      })
    });
    const decidedBody = (await decided.json()) as { status: string; decidedBy: string };

    expect(decided.status).toBe(200);
    expect(decidedBody.status).toBe("applied");
    expect(decidedBody.decidedBy).toBe(sessionUserId);
  });

  it("scopes /patches by workspaceId query param", async () => {
    const approvalStore = new InMemoryPatchApprovalStore();
    const daemon = createAgentDaemon({ store: new InMemoryAgentRunStore(), approvalStore });
    servers.push(daemon.server);
    const baseUrl = await listen(daemon.server);

    const otherWorkspaceId = "22222222-2222-4222-8222-222222222222";
    await approvalStore.propose({
      run: {
        id: "77777777-7777-4777-8777-777777777777",
        workspaceId,
        agentId: "draft",
        invocation: { workspaceId, agentId: "draft", input: "" },
        status: "succeeded",
        startedAt: new Date()
      },
      patch: { kind: "Patch", ops: [], rationale: "", requiresApproval: true }
    });
    await approvalStore.propose({
      run: {
        id: "88888888-8888-4888-8888-888888888888",
        workspaceId: otherWorkspaceId,
        agentId: "draft",
        invocation: { workspaceId: otherWorkspaceId, agentId: "draft", input: "" },
        status: "succeeded",
        startedAt: new Date()
      },
      patch: { kind: "Patch", ops: [], rationale: "", requiresApproval: true }
    });

    const scoped = await fetch(`${baseUrl}/patches?workspaceId=${workspaceId}`);
    const scopedBody = (await scoped.json()) as { patches: Array<{ workspaceId: string }> };
    expect(scopedBody.patches).toHaveLength(1);
    expect(scopedBody.patches[0]?.workspaceId).toBe(workspaceId);
  });

  it("returns 404 when deciding a missing patch and 409 when it is already terminal", async () => {
    const approvalStore = new InMemoryPatchApprovalStore();
    const daemon = createAgentDaemon({ store: new InMemoryAgentRunStore(), approvalStore });
    servers.push(daemon.server);
    const baseUrl = await listen(daemon.server);

    const decidedBy = "55555555-5555-4555-8555-555555555555";
    const missing = await fetch(`${baseUrl}/patches/99999999-9999-4999-8999-999999999999/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "applied", decidedBy })
    });
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toEqual({ error: "PATCH_NOT_FOUND" });

    const patch = await approvalStore.propose({
      run: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        workspaceId,
        agentId: "draft",
        invocation: { workspaceId, agentId: "draft", input: "" },
        status: "succeeded",
        startedAt: new Date()
      },
      patch: { kind: "Patch", ops: [], rationale: "", requiresApproval: true }
    });
    await approvalStore.decide({ id: patch.id, decision: "applied", decidedBy });

    const terminal = await fetch(`${baseUrl}/patches/${patch.id}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "rejected", decidedBy })
    });
    expect(terminal.status).toBe(409);
    await expect(terminal.json()).resolves.toEqual({ error: "PATCH_DECISION_TERMINAL" });
  });

  it("locks SQL patch rows before calling the decision function", async () => {
    const queries: { sql: string; values?: unknown[] }[] = [];
    const patchId = "99999999-9999-4999-8999-999999999999";
    const decidedBy = "55555555-5555-4555-8555-555555555555";
    const store = new SqlPatchApprovalStore({
      async query<Row>(sql: string, values?: unknown[]) {
        queries.push({ sql, values });
        if (sql.includes("FOR UPDATE OF p")) {
          return { rows: [{ status: "proposed", can_write: true }] as Row[] };
        }
        if (sql.includes("app_decide_patch")) {
          return { rows: [{ decided: true }] as Row[] };
        }
        if (sql.includes("JOIN agent_runs")) {
          return {
            rows: [
              {
                id: patchId,
                agent_run_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                workspace_id: workspaceId,
                ops: [],
                preview_html: null,
                status: "applied",
                decided_by: decidedBy,
                decided_at: new Date("2026-04-26T00:00:00.000Z")
              }
            ] as Row[]
          };
        }
        return { rows: [] as Row[] };
      }
    });

    await expect(store.decide({ id: patchId, decision: "applied", decidedBy })).resolves.toMatchObject({
      id: patchId,
      status: "applied"
    });

    const lockIndex = queries.findIndex((query) => query.sql.includes("FOR UPDATE OF p"));
    const decisionIndex = queries.findIndex((query) => query.sql.includes("app_decide_patch"));
    expect(queries[lockIndex]?.sql).toContain("app_can_write_workspace");
    expect(lockIndex).toBeGreaterThan(-1);
    expect(decisionIndex).toBeGreaterThan(lockIndex);
    expect(queries.at(-1)?.sql).toBe("COMMIT");
  });

  it("uses a typed SQL patch decision denial instead of leaking an internal error", async () => {
    const queries: { sql: string; values?: unknown[] }[] = [];
    const patchId = "99999999-9999-4999-8999-999999999999";
    const store = new SqlPatchApprovalStore({
      async query<Row>(sql: string, values?: unknown[]) {
        queries.push({ sql, values });
        if (sql.includes("FOR UPDATE OF p")) {
          return { rows: [{ status: "proposed", can_write: true }] as Row[] };
        }
        if (sql.includes("app_decide_patch")) {
          return { rows: [{ decided: false }] as Row[] };
        }
        return { rows: [] as Row[] };
      }
    });

    await expect(
      store.decide({
        id: patchId,
        decision: "applied",
        decidedBy: "55555555-5555-4555-8555-555555555555"
      })
    ).rejects.toBeInstanceOf(PatchDecisionDeniedError);
    expect(queries.at(-1)?.sql).toBe("ROLLBACK");
  });

  it("does not expose SQL terminal status to users without patch write permission", async () => {
    const queries: { sql: string; values?: unknown[] }[] = [];
    const patchId = "99999999-9999-4999-8999-999999999999";
    const store = new SqlPatchApprovalStore({
      async query<Row>(sql: string, values?: unknown[]) {
        queries.push({ sql, values });
        if (sql.includes("FOR UPDATE OF p")) {
          return { rows: [{ status: "rejected", can_write: false }] as Row[] };
        }
        return { rows: [] as Row[] };
      }
    });

    await expect(
      store.decide({
        id: patchId,
        decision: "applied",
        decidedBy: "55555555-5555-4555-8555-555555555555"
      })
    ).rejects.toBeInstanceOf(PatchDecisionDeniedError);
    expect(queries.some((query) => query.sql.includes("app_decide_patch"))).toBe(false);
    expect(queries.at(-1)?.sql).toBe("ROLLBACK");
  });

  it("returns 403 when the approval store denies a patch decision", async () => {
    const daemon = createAgentDaemon({
      store: new InMemoryAgentRunStore(),
      approvalStore: {
        async propose() {
          throw new Error("propose not used");
        },
        async decide() {
          throw new PatchDecisionDeniedError("99999999-9999-4999-8999-999999999999");
        },
        async get() {
          return undefined;
        },
        async list() {
          return [];
        }
      }
    });
    servers.push(daemon.server);
    const baseUrl = await listen(daemon.server);

    const denied = await fetch(`${baseUrl}/patches/99999999-9999-4999-8999-999999999999/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        decision: "applied",
        decidedBy: "55555555-5555-4555-8555-555555555555"
      })
    });

    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toEqual({ error: "PATCH_DECISION_DENIED" });
  });

  it("rejects invalid approval decisions before they reach the queue", async () => {
    const approvalStore = new InMemoryPatchApprovalStore();
    const daemon = createAgentDaemon({ store: new InMemoryAgentRunStore(), approvalStore });
    servers.push(daemon.server);
    const baseUrl = await listen(daemon.server);
    const patch = await approvalStore.propose({
      run: {
        id: "66666666-6666-4666-8666-666666666666",
        workspaceId,
        agentId: "draft",
        invocation: { workspaceId, agentId: "draft", input: "" },
        status: "succeeded",
        startedAt: new Date()
      },
      patch: { kind: "Patch", ops: [], rationale: "", requiresApproval: true }
    });

    const response = await fetch(`${baseUrl}/patches/${patch.id}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        decision: "approved",
        decidedBy: "55555555-5555-4555-8555-555555555555"
      })
    });

    expect(response.status).toBe(400);
    expect((await approvalStore.get(patch.id))?.status).toBe("proposed");
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

  it("runs IngestAgent directly from raw source context", () => {
    const patch = runIngestAgent({
      workspaceId,
      agentId: "ingest",
      input: "/ingest path:./inbox/onboarding.md",
      context: {
        rawSource: {
          rawId: "raw-onboarding",
          uri: "file://./inbox/onboarding.md",
          mime: "text/markdown",
          sha256: "abc123",
          bytes: 128,
          text: "Onboarding policy defines approvals. The checklist covers security, tools, and manager review."
        }
      }
    });

    expect(patch.outputSchema).toBe("IngestPatch");
    expect(patch.fanOut.summary).toBe(1);
    expect(patch.ops.filter((op) => op.kind === "create_doc").length).toBeGreaterThanOrEqual(3);
    expect(patch.ops.some((op) => op.kind === "append_log")).toBe(true);
  });

  it("keeps non-Latin ingest topic paths non-empty", () => {
    const patch = runIngestAgent({
      workspaceId,
      agentId: "ingest",
      input: "/ingest path:./inbox/자료.md",
      context: {
        rawSource: {
          rawId: "raw-korean",
          uri: "file://./inbox/자료.md",
          mime: "text/markdown",
          sha256: "abc123",
          bytes: 128,
          text: "온보딩 정책은 승인 절차를 정의합니다. 보안 체크리스트는 도구 검토를 포함합니다."
        }
      }
    });

    const createDocPaths = patch.ops
      .filter((op) => op.kind === "create_doc")
      .map((op) => op.path);

    expect(createDocPaths.every((path) => !path.endsWith("/.md"))).toBe(true);
    expect(createDocPaths.some((path) => /\p{L}/u.test(path))).toBe(true);
  });

  it("runs ImproveAgent for a selection and returns three alternatives", async () => {
    const approvalStore = new InMemoryPatchApprovalStore();
    const daemon = createAgentDaemon({ store: new InMemoryAgentRunStore(), approvalStore, ...deterministicRuntime });
    servers.push(daemon.server);
    const baseUrl = await listen(daemon.server);

    const created = await fetch(`${baseUrl}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        agentId: "improve",
        input: "/improve --tone executive --maxWords 12",
        context: {
          docId: "doc-1",
          body: "This is really a very important update for the team",
          selection: { from: 0, to: 52 }
        }
      })
    });
    const run = (await created.json()) as {
      status: string;
      patch: {
        outputSchema: string;
        ops: Array<{ alternativeId: string; text: string }>;
        readabilityScores: Record<string, { words: number }>;
        previewHtml: string;
      };
    };

    expect(created.status).toBe(201);
    expect(run.status).toBe("succeeded");
    expect(run.patch.outputSchema).toBe("ImprovePatch");
    expect(run.patch.ops.map((op) => op.alternativeId)).toEqual(["conservative", "tonal", "concise"]);
    expect(run.patch.ops.every((op) => op.text.split(/\s+/).length <= 12)).toBe(true);
    expect(run.patch.readabilityScores.concise?.words).toBeGreaterThan(0);
    expect(run.patch.previewHtml).toContain("weki-improve-preview");

    const queued = await approvalStore.list({ status: "proposed" });
    expect(queued).toHaveLength(1);
    expect(queued[0]?.ops).toHaveLength(3);
  });

  it("runs AskAgent with workspace sources and prepares a qa page", async () => {
    const approvalStore = new InMemoryPatchApprovalStore();
    const daemon = createAgentDaemon({ store: new InMemoryAgentRunStore(), approvalStore, ...deterministicRuntime });
    servers.push(daemon.server);
    const baseUrl = await listen(daemon.server);

    const created = await fetch(`${baseUrl}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        agentId: "ask",
        input: "/ask onboarding policy definition",
        context: {
          documents: [
            {
              docId: "doc-policy",
              title: "Onboarding Policy",
              path: "wiki/policies/onboarding.md",
              body: "The onboarding policy defines the first week checklist and required approvals."
            },
            {
              docId: "doc-random",
              title: "Unrelated",
              body: "Quarterly roadmap notes."
            }
          ]
        }
      })
    });
    const run = (await created.json()) as {
      status: string;
      patch: {
        outputSchema: string;
        answer: { answerMd: string; sources: Array<{ docId: string }>; confidence: number };
        ops: Array<{ kind: string; docKind: string; path: string; frontmatter: { sources: string[] } }>;
      };
    };

    expect(created.status).toBe(201);
    expect(run.status).toBe("succeeded");
    expect(run.patch.outputSchema).toBe("AskAnswerPatch");
    expect(run.patch.answer.sources[0]?.docId).toBe("doc-policy");
    expect(run.patch.answer.answerMd).toContain("[[Onboarding Policy]]");
    expect(run.patch.ops[0]).toMatchObject({ kind: "create_doc", docKind: "qa" });
    expect(run.patch.ops[0]?.path).toBe("wiki/qa/onboarding-policy-definition-0d705e3c.md");
    expect(run.patch.ops[0]?.frontmatter.sources).toEqual(["doc-policy"]);

    const queued = await approvalStore.list({ status: "proposed" });
    expect(queued[0]?.ops[0]).toMatchObject({ kind: "create_doc", docKind: "qa" });
  });

  it("runs IngestAgent and proposes 3-10 raw-derived wiki nodes", async () => {
    const approvalStore = new InMemoryPatchApprovalStore();
    const daemon = createAgentDaemon({ store: new InMemoryAgentRunStore(), approvalStore, ...deterministicRuntime });
    servers.push(daemon.server);
    const baseUrl = await listen(daemon.server);

    const created = await fetch(`${baseUrl}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        agentId: "ingest",
        input: "/ingest path:./inbox/onboarding.md",
        context: {
          rawSource: {
            rawId: "raw-onboarding",
            uri: "file://./inbox/onboarding.md",
            mime: "text/markdown",
            sha256: "abc123",
            bytes: 128,
            text: "Onboarding policy defines approvals. The checklist covers security, tools, and manager review."
          }
        }
      })
    });
    const run = (await created.json()) as {
      status: string;
      patch: {
        outputSchema: string;
        ops: Array<{ kind: string; docKind?: string; frontmatter?: { sources?: string[] } }>;
      };
    };

    expect(created.status).toBe(201);
    expect(run.status).toBe("succeeded");
    expect(run.patch.outputSchema).toBe("IngestPatch");
    const createDocs = run.patch.ops.filter((op) => op.kind === "create_doc");
    expect(createDocs.length).toBeGreaterThanOrEqual(3);
    expect(createDocs.length).toBeLessThanOrEqual(10);
    expect(createDocs.some((op) => op.docKind === "summary")).toBe(true);
    expect(createDocs.every((op) => op.frontmatter?.sources?.includes("raw-onboarding"))).toBe(true);
    expect(run.patch.ops.some((op) => op.kind === "append_log")).toBe(true);

    const queued = await approvalStore.list({ status: "proposed" });
    expect(queued[0]?.ops.filter((op) => (op as { kind?: string }).kind === "create_doc")).toHaveLength(createDocs.length);
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

  it("allows S-08 agents only their PRD-listed tools", async () => {
    const runtime = new ToolRuntime({
      lint_terms: () => ({ violations: [] }),
      search_workspace: () => ({ hits: [] }),
      web_fetch: () => ({ body: "external" })
    });

    await expect(runtime.call("improve", "lint_terms", {})).resolves.toEqual({ violations: [] });
    await expect(runtime.call("ask", "search_workspace", {})).resolves.toEqual({ hits: [] });
    await expect(runtime.call("ask", "web_fetch", {})).rejects.toMatchObject({
      code: "TOOL_NOT_ALLOWED"
    });
  });

  it("allows IngestAgent only its PRD-listed raw and retrieval tools", async () => {
    const runtime = new ToolRuntime({
      read_raw: () => ({ body: "raw" }),
      ocr: () => ({ text: "scanned" }),
      web_fetch: () => ({ body: "external" }),
      read_doc: () => ({ body: "doc" })
    });

    await expect(runtime.call("ingest", "read_raw", {})).resolves.toEqual({ body: "raw" });
    await expect(runtime.call("ingest", "ocr", {})).resolves.toEqual({ text: "scanned" });
    await expect(runtime.call("ingest", "web_fetch", {})).resolves.toEqual({ body: "external" });
    await expect(runtime.call("ingest", "read_doc", {})).rejects.toMatchObject({
      code: "TOOL_NOT_ALLOWED"
    });
  });

  it("allows S-10 system operations only through the system tool surface", async () => {
    const runtime = new ToolRuntime({
      search_workspace: () => ({ hits: [] }),
      grep_workspace: () => ({ paths: [] }),
      diff_doc_versions: () => ({ lines: [] }),
      blame_doc_versions: () => ({ lines: [] }),
      revert_doc_version: () => ({ status: "planned" }),
      lint_workspace: () => ({ issues: [] }),
      web_fetch: () => ({ body: "external" })
    });

    await expect(runtime.call("system", "search_workspace", {})).resolves.toEqual({ hits: [] });
    await expect(runtime.call("system", "grep_workspace", {})).resolves.toEqual({ paths: [] });
    await expect(runtime.call("system", "diff_doc_versions", {})).resolves.toEqual({ lines: [] });
    await expect(runtime.call("system", "blame_doc_versions", {})).resolves.toEqual({ lines: [] });
    await expect(runtime.call("system", "revert_doc_version", {})).resolves.toEqual({ status: "planned" });
    await expect(runtime.call("system", "lint_workspace", {})).resolves.toEqual({ issues: [] });
    await expect(runtime.call("system", "web_fetch", {})).rejects.toMatchObject({
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
