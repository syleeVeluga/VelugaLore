import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DesktopWorkspaceSession, type DesktopEvent } from "./desktop-session.js";
import { assertDesktopIpcSurface, desktopIpcCommands, desktopIpcEvents } from "./ipc-contract.js";
import { sha256Hex } from "./workspace-sync.js";

describe("S-08.5 desktop shell IPC contract", () => {
  it("registers every command and event named by PRD 13.7.4", () => {
    expect(desktopIpcCommands).toEqual([
      "open_workspace",
      "list_documents",
      "read_doc",
      "create_doc",
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
      session = new DesktopWorkspaceSession({ watcherDebounceMs: 25 });

      const opened = await session.openWorkspace(tempRoot);

      expect(existsSync(path.join(tempRoot, ".weki"))).toBe(true);
      expect(opened.workspaceId).toMatch(/[0-9a-f-]{36}/);
      expect(opened.agentServerPort).toBeGreaterThan(0);
      const health = await fetch(`http://127.0.0.1:${opened.agentServerPort}/health`);
      await expect(health.json()).resolves.toEqual({ status: "ok" });
    },
    30_000
  );

  it(
    "completes the manual /draft approval flow and keeps disk body_sha256 in parity",
    async () => {
      tempRoot = await mkdtemp(path.join(os.tmpdir(), "weki-desktop-"));
      session = new DesktopWorkspaceSession({ watcherDebounceMs: 25 });
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
});

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
