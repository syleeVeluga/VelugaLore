import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyTwoPhaseDocumentWrite,
  NodeWorkspaceFileMirror,
  reconcileWorkspace,
  sha256Hex,
  type DocumentBodyUpdateInput,
  type DocumentVersionInput,
  type DocumentWriteTransaction,
  type WorkspaceDocumentRecord,
  type WorkspaceDocumentStore,
  type WorkspaceSyncConflict
} from "./workspace-sync.js";

class MemoryStore implements WorkspaceDocumentStore {
  documents = new Map<string, WorkspaceDocumentRecord>();
  versions: DocumentVersionInput[] = [];
  conflicts: WorkspaceSyncConflict[] = [];
  commitError?: Error;

  addDocument(input: Omit<WorkspaceDocumentRecord, "bodySha256"> & { bodySha256?: string }) {
    this.documents.set(input.id, {
      ...input,
      bodySha256: input.bodySha256 ?? sha256Hex(input.body)
    });
  }

  async beginWrite(): Promise<DocumentWriteTransaction> {
    const snapshot = new Map(this.documents);
    const versionsSnapshot = [...this.versions];
    let closed = false;

    return {
      getDocument: async (docId) => this.documents.get(docId),
      updateDocumentBody: async (input: DocumentBodyUpdateInput) => {
        const current = this.documents.get(input.docId);
        if (!current) {
          return undefined;
        }
        if (current.rev !== input.expectedRev) {
          return "conflict";
        }
        const updated = {
          ...current,
          body: input.body,
          bodySha256: sha256Hex(input.body),
          rev: current.rev + 1,
          lastEditor: input.lastEditor
        } satisfies WorkspaceDocumentRecord;
        this.documents.set(input.docId, updated);
        return updated;
      },
      insertDocumentVersion: async (input: DocumentVersionInput) => {
        this.versions.push(input);
      },
      commit: async () => {
        if (this.commitError) {
          throw this.commitError;
        }
        closed = true;
      },
      rollback: async () => {
        if (!closed) {
          this.documents = new Map(snapshot);
          this.versions = [...versionsSnapshot];
          closed = true;
        }
      }
    };
  }

  async listDocuments(): Promise<WorkspaceDocumentRecord[]> {
    return [...this.documents.values()];
  }

  async fastForwardExternalEdit(input: { docId: string; expectedRev: number; body: string }) {
    const current = this.documents.get(input.docId);
    if (!current) {
      return undefined;
    }
    if (current.rev !== input.expectedRev) {
      return "conflict";
    }
    const updated = {
      ...current,
      body: input.body,
      bodySha256: sha256Hex(input.body),
      rev: current.rev + 1,
      lastEditor: "human" as const
    };
    this.documents.set(input.docId, updated);
    this.versions.push({
      docId: input.docId,
      rev: updated.rev,
      body: input.body,
      bodySha256: updated.bodySha256,
      source: "sync"
    });
    return updated;
  }

  async recordConflict(conflict: WorkspaceSyncConflict): Promise<void> {
    this.conflicts.push(conflict);
  }
}

class FailingMirror extends NodeWorkspaceFileMirror {
  override async writeDocumentAtomically(): Promise<string> {
    throw new Error("simulated fs failure");
  }
}

describe("S-03 workspace sync", () => {
  let tempRoot: string;
  let store: MemoryStore;
  let mirror: NodeWorkspaceFileMirror;

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "weki-sync-"));
    store = new MemoryStore();
    mirror = new NodeWorkspaceFileMirror(tempRoot);
    store.addDocument({
      id: "doc-1",
      path: "wiki/test.md",
      body: "before",
      rev: 1,
      lastEditor: "human"
    });
    await mirror.writeDocumentAtomically("wiki/test.md", "before", "doc-1");
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("applies in-app edits with DB and file sha256 kept together", async () => {
    const result = await applyTwoPhaseDocumentWrite({
      store,
      mirror,
      docId: "doc-1",
      expectedRev: 1,
      body: "after",
      actor: "human"
    });

    expect(result.status).toBe("applied");
    const document = store.documents.get("doc-1")!;
    expect(document.rev).toBe(2);
    expect(document.bodySha256).toBe(sha256Hex("after"));
    expect(await readFile(path.join(tempRoot, "wiki/test.md"), "utf8")).toBe("after");
    expect(store.versions).toMatchObject([{ docId: "doc-1", rev: 2, source: "human" }]);
  });

  it("rolls back the DB transaction when the atomic file write fails", async () => {
    await expect(
      applyTwoPhaseDocumentWrite({
        store,
        mirror: new FailingMirror(tempRoot),
        docId: "doc-1",
        expectedRev: 1,
        body: "not committed",
        actor: "agent"
      })
    ).rejects.toThrow(/simulated fs failure/);

    expect(store.documents.get("doc-1")).toMatchObject({ body: "before", rev: 1, bodySha256: sha256Hex("before") });
    expect(store.versions).toHaveLength(0);
    expect(await readFile(path.join(tempRoot, "wiki/test.md"), "utf8")).toBe("before");
  });

  it("restores the file mirror when the DB commit fails after rename", async () => {
    store.commitError = new Error("simulated commit failure");

    await expect(
      applyTwoPhaseDocumentWrite({
        store,
        mirror,
        docId: "doc-1",
        expectedRev: 1,
        body: "renamed but not committed",
        actor: "human"
      })
    ).rejects.toThrow(/simulated commit failure/);

    expect(store.documents.get("doc-1")).toMatchObject({ body: "before", rev: 1, bodySha256: sha256Hex("before") });
    expect(store.versions).toHaveLength(0);
    expect(await readFile(path.join(tempRoot, "wiki/test.md"), "utf8")).toBe("before");
  });

  it("fast-forwards external edits when the last DB editor was human", async () => {
    await writeFile(path.join(tempRoot, "wiki/test.md"), "external edit", "utf8");

    const results = await reconcileWorkspace({ store, mirror });

    expect(results).toMatchObject([{ status: "fast_forwarded" }]);
    expect(store.documents.get("doc-1")).toMatchObject({
      body: "external edit",
      bodySha256: sha256Hex("external edit"),
      rev: 2,
      lastEditor: "human"
    });
    expect(store.versions).toMatchObject([{ docId: "doc-1", rev: 2, source: "sync" }]);
  });

  it("surfaces conflicts instead of overwriting external edits after an agent write", async () => {
    const agentWrite = await applyTwoPhaseDocumentWrite({
      store,
      mirror,
      docId: "doc-1",
      expectedRev: 1,
      body: "agent edit",
      actor: "agent"
    });
    expect(agentWrite.status).toBe("applied");
    await writeFile(path.join(tempRoot, "wiki/test.md"), "external edit after agent", "utf8");

    const results = await reconcileWorkspace({ store, mirror });

    expect(results).toMatchObject([{ status: "conflict", conflict: { reason: "external_edit_after_agent" } }]);
    expect(store.conflicts).toHaveLength(1);
    expect(store.documents.get("doc-1")).toMatchObject({ body: "agent edit", rev: 2 });
  });

  it("keeps sha256 consistent through interleaved human, external, and agent edits", async () => {
    const human = await applyTwoPhaseDocumentWrite({
      store,
      mirror,
      docId: "doc-1",
      expectedRev: 1,
      body: "human edit",
      actor: "human"
    });
    expect(human.status).toBe("applied");

    await writeFile(path.join(tempRoot, "wiki/test.md"), "external edit", "utf8");
    await reconcileWorkspace({ store, mirror });

    const agent = await applyTwoPhaseDocumentWrite({
      store,
      mirror,
      docId: "doc-1",
      expectedRev: 3,
      body: "agent edit",
      actor: "agent"
    });

    expect(agent.status).toBe("applied");
    const document = store.documents.get("doc-1")!;
    const fileBody = await readFile(path.join(tempRoot, "wiki/test.md"), "utf8");
    expect(document.rev).toBe(4);
    expect(document.body).toBe(fileBody);
    expect(document.bodySha256).toBe(sha256Hex(fileBody));
    expect(store.versions.map((version) => version.source)).toEqual(["human", "sync", "agent"]);
  });
});
