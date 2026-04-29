import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DesktopWorkspaceSession, type DesktopEvent, type DesktopWorkspaceSessionOptions } from "./desktop-session.js";
import { assertDesktopIpcSurface, desktopIpcCommands, desktopIpcEvents } from "./ipc-contract.js";
import { sha256Hex } from "./workspace-sync.js";

describe("S-08.5 desktop shell IPC contract", () => {
  it("registers every command and event named by PRD 13.7.4", () => {
    expect(desktopIpcCommands).toEqual([
      "open_workspace",
      "list_documents",
      "read_doc",
      "create_doc",
      "create_folder",
      "rename_doc",
      "move_doc",
      "duplicate_doc",
      "archive_doc",
      "restore_doc",
      "update_doc_metadata",
      "apply_patch",
      "list_pending_approvals"
    ]);
    expect(desktopIpcEvents).toEqual(["doc_changed", "agent_run_progress", "agent_run_completed"]);
    expect(() => assertDesktopIpcSurface({ commands: desktopIpcCommands, events: desktopIpcEvents })).not.toThrow();
  });
});

describe("S-08.5 desktop workspace session", () => {
  let tempRoot: string;
  let session: DesktopWorkspaceSession | undefined;

  afterEach(async () => {
    await session?.close();
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it(
    "opens an empty workspace, creates .weki, and starts agent-server as a subprocess",
    async () => {
      tempRoot = await mkdtemp(path.join(os.tmpdir(), "weki-desktop-"));
      session = new DesktopWorkspaceSession({
        watcherDebounceMs: 25,
        env: testRuntimeEnv(),
        ...agentServerSubprocessOptions()
      });

      const opened = await session.openWorkspace(tempRoot);

      expect(existsSync(path.join(tempRoot, ".weki"))).toBe(true);
      await expect(readFile(path.join(tempRoot, ".weki", "AGENTS.md"), "utf8")).resolves.toContain("default_mode: analyze");
      expect(opened.workspaceId).toMatch(/[0-9a-f-]{36}/);
      expect(opened.mode).toBe("solo");
      expect(opened.userId).toMatch(/[0-9a-f-]{36}/);
      const userJson = JSON.parse(await readFile(path.join(tempRoot, ".weki", "user.json"), "utf8")) as { user_id?: string };
      expect(userJson.user_id).toBe(opened.userId);
      expect(opened.agentServerPort).toBeGreaterThan(0);
      expect(opened.defaultMode).toBe("analyze");
      const health = await fetch(`http://127.0.0.1:${opened.agentServerPort}/health`);
      await expect(health.json()).resolves.toEqual({ status: "ok" });
    },
    30_000
  );

  it(
    "completes the manual /draft approval flow and keeps disk body_sha256 in parity",
    async () => {
      tempRoot = await mkdtemp(path.join(os.tmpdir(), "weki-desktop-"));
      session = new DesktopWorkspaceSession({
        watcherDebounceMs: 25,
        env: testRuntimeEnv(),
        ...agentServerSubprocessOptions()
      });
      await session.openWorkspace(tempRoot);
      const doc = await session.createDoc({ path: "Untitled.md" });

      const run = await session.runDraft({
        docId: doc.id,
        prompt: "/draft 근태 관리 규정 초안 작성 --audience editors"
      });
      expect(run.status).toBe("succeeded");
      const pending = await session.listPendingApprovals();
      expect(pending).toHaveLength(1);
      expect(pending[0]).toMatchObject({ agentRunId: run.id, status: "proposed" });

      const result = await session.applyPatch(run.id, "approve");

      expect(result.status).toBe("applied");
      if (result.status !== "applied") {
        return;
      }
      const diskBody = await readFile(path.join(tempRoot, "Untitled.md"), "utf8");
      expect(diskBody).toContain("## Context");
      expect(result.document.body).toBe(diskBody);
      expect(result.document.bodySha256).toBe(sha256Hex(diskBody));
      await expect(session.readDoc(doc.id)).resolves.toMatchObject({
        rev: 2,
        bodySha256: sha256Hex(diskBody)
      });
      await expect(session.listPendingApprovals()).resolves.toHaveLength(0);
    },
    30_000
  );

  it(
    "walks the PRD §13.7.3 nine-step /draft tracer in a single session",
    async () => {
      tempRoot = await mkdtemp(path.join(os.tmpdir(), "weki-desktop-"));
      session = new DesktopWorkspaceSession({
        watcherDebounceMs: 25,
        env: testRuntimeEnv(),
        ...agentServerSubprocessOptions()
      });

      const events: DesktopEvent[] = [];
      const unsubscribe = session.onEvent((event) => {
        events.push(event);
      });

      // Steps 1-2: the renderer asks the shell to open an empty workspace; .weki/ is provisioned and agent-server is up.
      const opened = await session.openWorkspace(tempRoot);
      expect(existsSync(path.join(tempRoot, ".weki"))).toBe(true);
      expect(opened.agentServerPort).toBeGreaterThan(0);
      await expect(fetch(`http://127.0.0.1:${opened.agentServerPort}/health`).then((r) => r.json())).resolves.toEqual({
        status: "ok"
      });

      // Step 3: empty file tree, then "New Note" creates Untitled.md at rev=1.
      await expect(session.listDocuments()).resolves.toEqual([]);
      const created = await session.createDoc({ path: "Untitled.md" });
      expect(created).toMatchObject({ path: "Untitled.md", rev: 1, body: "", lastEditor: "human" });

      // Step 4: opening Untitled.md returns the same body and matching sha.
      const opening = await session.readDoc(created.id);
      expect(opening).toMatchObject({ body: "", rev: 1, bodySha256: sha256Hex("") });

      // Step 5: a `/` typed in the editor resolves to /draft via the slash menu and the prompt is dispatched.
      session = session as DesktopWorkspaceSession;
      const run = await session.runDraft({
        docId: created.id,
        prompt: "/draft 근태 관리 규정 초안 작성 --audience editors"
      });
      expect(run.status).toBe("succeeded");
      expect(events.some((event) => event.type === "agent_run_progress")).toBe(true);
      expect(events.some((event) => event.type === "agent_run_completed" && event.payload.run_id === run.id)).toBe(true);

      // Step 6: the right-pane approval queue shows a proposed patch tied to this run.
      const pending = await session.listPendingApprovals();
      expect(pending).toHaveLength(1);
      expect(pending[0]).toMatchObject({ agentRunId: run.id, status: "proposed" });

      // Step 7: approve -> 2-phase write commits the patch with matching body_sha256 on disk.
      const applied = await session.applyPatch(run.id, "approve");
      expect(applied.status).toBe("applied");
      if (applied.status !== "applied") {
        unsubscribe();
        return;
      }
      const diskBody = await readFile(path.join(tempRoot, "Untitled.md"), "utf8");
      expect(applied.document.body).toBe(diskBody);
      expect(applied.document.bodySha256).toBe(sha256Hex(diskBody));

      // Step 8: the editor sees rev=2, the path is stable, and the doc_changed agent event was emitted.
      await expect(session.readDoc(created.id)).resolves.toMatchObject({ rev: 2, bodySha256: sha256Hex(diskBody) });
      expect(applied.document.path).toBe(created.path);
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "doc_changed",
          payload: expect.objectContaining({ doc_id: created.id, rev: 2, source: "agent" })
        })
      );

      // Step 9: an external editor saves the file -> watcher emits doc_changed within the 5s window.
      const externalSync = waitForEvent(session, (event) => event.type === "doc_changed" && event.payload.source === "sync");
      const externalBody = `${diskBody}\nexternal edit\n`;
      await writeFile(path.join(tempRoot, "Untitled.md"), externalBody, "utf8");
      const syncEvent = await externalSync;
      expect(syncEvent).toMatchObject({
        type: "doc_changed",
        payload: { doc_id: created.id, rev: 3, source: "sync" }
      });
      await expect(session.readDoc(created.id)).resolves.toMatchObject({
        body: externalBody,
        rev: 3,
        bodySha256: sha256Hex(externalBody)
      });

      unsubscribe();
    },
    30_000
  );

  it("emits doc_changed for an external edit within the watcher window", async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "weki-desktop-"));
    session = new DesktopWorkspaceSession({ watcherDebounceMs: 25, startAgentServer: false });
    await session.openWorkspace(tempRoot);
    const doc = await session.createDoc({ path: "External.md", body: "first" });
    const changed = waitForEvent(session, (event) => event.type === "doc_changed" && event.payload.source === "sync");

    await writeFile(path.join(tempRoot, "External.md"), "external edit", "utf8");
    const event = await changed;

    expect(event).toMatchObject({ type: "doc_changed", payload: { doc_id: doc.id, rev: 2, source: "sync" } });
    await expect(session.readDoc(doc.id)).resolves.toMatchObject({
      body: "external edit",
      rev: 2,
      bodySha256: sha256Hex("external edit")
    });
  });

  it("supports manual page and folder management through audited two-phase writes", async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "weki-desktop-"));
    session = new DesktopWorkspaceSession({ watcherDebounceMs: 25, startAgentServer: false });
    await session.openWorkspace(tempRoot);

    const folder = await session.createFolder({ path: "wiki/policies" });
    const page = await session.createDoc({ path: "wiki/policies/onboarding.md", body: "# Onboarding\n" });
    const renamed = await session.renameDoc({ docId: page.id, title: "Employee Onboarding" });
    const moved = await session.moveDoc({ docId: renamed.id, folderPath: "wiki/hr" });
    const taggedSource = await session.updateDocMetadata({
      docId: moved.id,
      metadata: { kind: "concept", tags: ["manual", "hr"], frontmatter: { owner: "people", _import: { source: "test" } } }
    });
    const duplicate = await session.duplicateDoc({ docId: moved.id });
    const archived = await session.archiveDoc({ docId: moved.id });
    expect("deleted" in archived).toBe(false);
    if ("deleted" in archived) {
      return;
    }
    const restored = await session.restoreDoc({ docId: archived.id, path: "wiki/hr/restored-onboarding.md" });

    expect(folder.path).toBe("wiki/policies/_index.md");
    expect(moved.path).toBe("wiki/hr/employee-onboarding.md");
    expect(taggedSource).toMatchObject({ kind: "concept", tags: ["manual", "hr"], frontmatter: { owner: "people" } });
    expect(duplicate.path).toBe("wiki/hr/employee-onboarding-copy.md");
    expect(duplicate).toMatchObject({ kind: "concept", tags: ["manual", "hr"], frontmatter: { owner: "people" } });
    expect(duplicate.frontmatter).not.toHaveProperty("_import");
    expect(archived.path).toBe("wiki/_archive/employee-onboarding.md");
    expect(restored.path).toBe("wiki/hr/restored-onboarding.md");
    await expect(readFile(path.join(tempRoot, "wiki/hr/restored-onboarding.md"), "utf8")).resolves.toContain("# Onboarding");
  });

  it("rejects manual path collisions before writing or removing files", async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "weki-desktop-"));
    session = new DesktopWorkspaceSession({ watcherDebounceMs: 25, startAgentServer: false });
    await session.openWorkspace(tempRoot);

    const first = await session.createDoc({ path: "wiki/first.md", body: "# First\n" });
    await session.createDoc({ path: "wiki/second.md", body: "# Second\n" });

    await expect(session.renameDoc({ docId: first.id, title: "Second" })).rejects.toThrow("Document path already exists");
    await expect(readFile(path.join(tempRoot, "wiki/second.md"), "utf8")).resolves.toBe("# Second\n");
    await expect(readFile(path.join(tempRoot, "wiki/first.md"), "utf8")).resolves.toBe("# First\n");
  });

  it("honors an existing workspace AGENTS.md default_mode override", async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "weki-desktop-"));
    await mkdir(path.join(tempRoot, ".weki"), { recursive: true });
    await writeFile(path.join(tempRoot, ".weki", "AGENTS.md"), "default_mode: edit # allow writes\n", "utf8");
    session = new DesktopWorkspaceSession({ watcherDebounceMs: 25, startAgentServer: false });

    const opened = await session.openWorkspace(tempRoot);

    expect(opened.defaultMode).toBe("edit");
  });

  it("reuses the stable Solo identity and audits writes with the active user", async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "weki-desktop-"));
    session = new DesktopWorkspaceSession({ watcherDebounceMs: 25, startAgentServer: false, devActAsRole: "admin" });

    const firstOpen = await session.openWorkspace(tempRoot);
    const firstDoc = await session.createDoc({ path: "Solo.md", body: "# Solo\n" });
    const firstAuditLog = (session as unknown as { store?: { auditLog: Array<{ action: string; actorUserId?: string; actedAsRole?: string }> } }).store?.auditLog ?? [];
    await session.close();

    session = new DesktopWorkspaceSession({ watcherDebounceMs: 25, startAgentServer: false });
    const secondOpen = await session.openWorkspace(tempRoot);

    expect(secondOpen.userId).toBe(firstOpen.userId);
    expect(firstOpen.actedAsRole).toBe("admin");
    expect(firstDoc.id).toMatch(/[0-9a-f-]{36}/);
    const userJson = JSON.parse(await readFile(path.join(tempRoot, ".weki", "user.json"), "utf8")) as { user_id?: string };
    expect(userJson.user_id).toBe(firstOpen.userId);
    expect(firstAuditLog).toContainEqual(
      expect.objectContaining({ action: "manual.create_doc", actorUserId: firstOpen.userId, actedAsRole: "admin" })
    );
  });

  it("updates dev act-as for subsequent local write audit payloads", async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "weki-desktop-"));
    session = new DesktopWorkspaceSession({ watcherDebounceMs: 25, startAgentServer: false });
    const opened = await session.openWorkspace(tempRoot);

    session.setDevActAsRole("reader");
    await session.createDoc({ path: "Reader.md", body: "# Reader\n" });

    const auditLog = (session as unknown as { store?: { auditLog: Array<{ action: string; actorUserId?: string; actedAsRole?: string }> } }).store?.auditLog ?? [];
    expect(auditLog).toContainEqual(
      expect.objectContaining({ action: "manual.create_doc", actorUserId: opened.userId, actedAsRole: "reader" })
    );
  });

  it("sends an explicit empty act-as header after returning to Solo", async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "weki-desktop-"));
    session = new DesktopWorkspaceSession({ watcherDebounceMs: 25, startAgentServer: false, devActAsRole: "admin" });
    await session.openWorkspace(tempRoot);

    const headersForAgentServer = () =>
      (session as unknown as { agentServerHeaders(headers: Record<string, string>): Record<string, string> })
        .agentServerHeaders({ "content-type": "application/json" });
    const devActAsHeaderName = ["x-weki", "dev", "as", "role"].join("-");

    expect(headersForAgentServer()[devActAsHeaderName]).toBe("admin");
    session.setDevActAsRole(undefined);
    expect(headersForAgentServer()[devActAsHeaderName]).toBe("");
  });

  it("ignores runtime dev act-as changes in production sessions", async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "weki-desktop-"));
    session = new DesktopWorkspaceSession({ watcherDebounceMs: 25, startAgentServer: false, nodeEnv: "production" });
    const opened = await session.openWorkspace(tempRoot);

    session.setDevActAsRole("owner");
    await session.createDoc({ path: "Production.md", body: "# Production\n" });

    const auditLog = (session as unknown as { store?: { auditLog: Array<{ action: string; actorUserId?: string; actedAsRole?: string }> } }).store?.auditLog ?? [];
    expect(auditLog).toContainEqual(
      expect.objectContaining({ action: "manual.create_doc", actorUserId: opened.userId, actedAsRole: undefined })
    );
  });

  it("reuses a legacy camelCase Solo identity file", async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "weki-desktop-"));
    await mkdir(path.join(tempRoot, ".weki"), { recursive: true });
    await writeFile(
      path.join(tempRoot, ".weki", "user.json"),
      JSON.stringify({
        version: 1,
        userId: "55555555-5555-4555-8555-555555555555",
        displayName: "Legacy Solo",
        provisionedAt: "2026-04-28T00:00:00.000Z"
      }),
      "utf8"
    );
    session = new DesktopWorkspaceSession({ watcherDebounceMs: 25, startAgentServer: false });

    const opened = await session.openWorkspace(tempRoot);

    expect(opened.userId).toBe("55555555-5555-4555-8555-555555555555");
    expect(opened.displayName).toBe("Legacy Solo");
  });
});

function testRuntimeEnv(): NodeJS.ProcessEnv {
  return { ...process.env, WEKI_AGENT_RUNTIME: "test" };
}

function agentServerSubprocessOptions(): Partial<Pick<
  DesktopWorkspaceSessionOptions,
  "agentServerCommand" | "agentServerArgs"
>> {
  if (process.env.npm_execpath && existsSync(process.env.npm_execpath)) {
    return {};
  }

  return {
    agentServerCommand: process.platform === "win32" ? "cmd.exe" : "corepack",
    agentServerArgs:
      process.platform === "win32"
        ? ["/d", "/s", "/c", "corepack", "pnpm", "--filter", "@weki/agent-server", "run", "server", "--"]
        : ["pnpm", "--filter", "@weki/agent-server", "run", "server", "--"]
  };
}

function waitForEvent(
  session: DesktopWorkspaceSession,
  predicate: (event: DesktopEvent) => boolean
): Promise<DesktopEvent> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error("Timed out waiting for desktop event."));
    }, 5_000);
    const unsubscribe = session.onEvent((event) => {
      if (predicate(event)) {
        clearTimeout(timeout);
        unsubscribe();
        resolve(event);
      }
    });
  });
}
