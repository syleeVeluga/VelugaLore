import { createHash, randomUUID } from "node:crypto";
import { open, mkdir, readFile, rename, rm, stat, watch } from "node:fs/promises";
import path from "node:path";

export type WorkspaceEditActor = "human" | "agent";
export type DocumentVersionSource = WorkspaceEditActor | "sync";

export interface WorkspaceDocumentRecord {
  id: string;
  path: string;
  body: string;
  bodySha256: string;
  rev: number;
  lastEditor: WorkspaceEditActor;
  hasPendingPatch?: boolean;
}

export interface DocumentVersionInput {
  docId: string;
  rev: number;
  body: string;
  bodySha256: string;
  source: DocumentVersionSource;
  agentRunId?: string;
}

export interface DocumentBodyUpdateInput {
  docId: string;
  expectedRev: number;
  body: string;
  lastEditor: WorkspaceEditActor;
}

export interface ExternalFastForwardInput {
  docId: string;
  expectedRev: number;
  body: string;
}

export interface DocumentWriteTransaction {
  getDocument(docId: string): Promise<WorkspaceDocumentRecord | undefined>;
  updateDocumentBody(input: DocumentBodyUpdateInput): Promise<WorkspaceDocumentRecord | "conflict" | undefined>;
  insertDocumentVersion(input: DocumentVersionInput): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface WorkspaceDocumentStore {
  beginWrite(): Promise<DocumentWriteTransaction>;
  listDocuments(): Promise<WorkspaceDocumentRecord[]>;
  fastForwardExternalEdit(input: ExternalFastForwardInput): Promise<WorkspaceDocumentRecord | "conflict" | undefined>;
  recordConflict(conflict: WorkspaceSyncConflict): Promise<void>;
}

export type WorkspaceSyncConflictReason =
  | "external_edit_after_agent"
  | "missing_file"
  | "rev_conflict"
  | "document_missing";

export interface WorkspaceSyncConflict {
  docId: string;
  path: string;
  reason: WorkspaceSyncConflictReason;
  dbRev: number;
  dbBodySha256: string;
  fsBodySha256?: string;
}

export type TwoPhaseWriteResult =
  | { status: "applied"; document: WorkspaceDocumentRecord; filePath: string }
  | { status: "conflict"; conflict: WorkspaceSyncConflict }
  | { status: "missing"; docId: string };

export type ReconcileResult =
  | { status: "unchanged"; document: WorkspaceDocumentRecord }
  | { status: "fast_forwarded"; document: WorkspaceDocumentRecord }
  | { status: "conflict"; conflict: WorkspaceSyncConflict };

export interface WorkspaceFileMirror {
  resolveDocumentPath(documentPath: string): string;
  writeDocumentAtomically(documentPath: string, body: string, docId: string): Promise<string>;
  readDocument(documentPath: string): Promise<string>;
  exists(documentPath: string): Promise<boolean>;
  startWatcher(onPathChanged: (documentPath: string) => void, debounceMs?: number): Promise<{ close(): Promise<void> }>;
}

export function sha256Hex(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

function ensureInside(root: string, candidate: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Document path escapes workspace root: ${candidate}`);
  }
  return resolvedCandidate;
}

function toDocumentPath(root: string, changedPath: string): string {
  return path.relative(root, changedPath).split(path.sep).join("/");
}

async function fsyncFile(filePath: string): Promise<void> {
  const handle = await open(filePath, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function bestEffortFsyncFile(filePath: string): Promise<void> {
  try {
    await fsyncFile(filePath);
  } catch {
    // Windows can reject fsync on handles that were just atomically replaced.
  }
}

async function bestEffortFsyncDirectory(dirPath: string): Promise<void> {
  try {
    const handle = await open(dirPath, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // Some platforms, including parts of Windows, do not support fsync on directories.
  }
}

export class NodeWorkspaceFileMirror implements WorkspaceFileMirror {
  readonly workspaceRoot: string;
  readonly tmpDir: string;

  constructor(workspaceRoot: string, tmpDir = path.join(workspaceRoot, ".weki", ".tmp")) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.tmpDir = path.resolve(tmpDir);
  }

  resolveDocumentPath(documentPath: string): string {
    return ensureInside(this.workspaceRoot, path.join(this.workspaceRoot, documentPath));
  }

  async writeDocumentAtomically(documentPath: string, body: string, docId: string): Promise<string> {
    const targetPath = this.resolveDocumentPath(documentPath);
    const targetDir = path.dirname(targetPath);
    const tmpPath = path.join(this.tmpDir, `${docId}.${Date.now()}.${randomUUID()}.tmp`);

    await mkdir(targetDir, { recursive: true });
    await mkdir(this.tmpDir, { recursive: true });

    try {
      const handle = await open(tmpPath, "w");
      try {
        await handle.writeFile(body, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }

      await rename(tmpPath, targetPath);
      await bestEffortFsyncFile(targetPath);
      await bestEffortFsyncDirectory(targetDir);
      return targetPath;
    } catch (error) {
      await rm(tmpPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async readDocument(documentPath: string): Promise<string> {
    return readFile(this.resolveDocumentPath(documentPath), "utf8");
  }

  async exists(documentPath: string): Promise<boolean> {
    try {
      await stat(this.resolveDocumentPath(documentPath));
      return true;
    } catch {
      return false;
    }
  }

  async startWatcher(onPathChanged: (documentPath: string) => void, debounceMs = 5000): Promise<{ close(): Promise<void> }> {
    await mkdir(this.workspaceRoot, { recursive: true });
    const abortController = new AbortController();
    const watcher = watch(this.workspaceRoot, { recursive: true, signal: abortController.signal });
    const timers = new Map<string, NodeJS.Timeout>();
    let closed = false;

    void (async () => {
      try {
        for await (const event of watcher) {
          if (closed || !event.filename) {
            continue;
          }
          const changedPath = path.join(this.workspaceRoot, event.filename.toString());
          const documentPath = toDocumentPath(this.workspaceRoot, changedPath);
          if (documentPath.startsWith(".weki/")) {
            continue;
          }
          const existing = timers.get(documentPath);
          if (existing) {
            clearTimeout(existing);
          }
          timers.set(
            documentPath,
            setTimeout(() => {
              timers.delete(documentPath);
              onPathChanged(documentPath);
            }, debounceMs)
          );
        }
      } catch (error) {
        if (!closed) {
          throw error;
        }
      }
    })();

    return {
      async close() {
        closed = true;
        for (const timer of timers.values()) {
          clearTimeout(timer);
        }
        abortController.abort();
      }
    };
  }
}

export async function applyTwoPhaseDocumentWrite(input: {
  store: WorkspaceDocumentStore;
  mirror: WorkspaceFileMirror;
  docId: string;
  expectedRev: number;
  body: string;
  actor: WorkspaceEditActor;
  agentRunId?: string;
}): Promise<TwoPhaseWriteResult> {
  const tx = await input.store.beginWrite();
  let before: WorkspaceDocumentRecord | undefined;
  let mirrorWasUpdated = false;

  try {
    before = await tx.getDocument(input.docId);
    if (!before) {
      await tx.rollback();
      return { status: "missing", docId: input.docId };
    }

    const updated = await tx.updateDocumentBody({
      docId: input.docId,
      expectedRev: input.expectedRev,
      body: input.body,
      lastEditor: input.actor
    });

    if (!updated || updated === "conflict") {
      await tx.rollback();
      return {
        status: "conflict",
        conflict: {
          docId: before.id,
          path: before.path,
          reason: updated === "conflict" ? "rev_conflict" : "document_missing",
          dbRev: before.rev,
          dbBodySha256: before.bodySha256
        }
      };
    }

    await tx.insertDocumentVersion({
      docId: updated.id,
      rev: updated.rev,
      body: input.body,
      bodySha256: updated.bodySha256,
      source: input.actor,
      agentRunId: input.agentRunId
    });

    const filePath = await input.mirror.writeDocumentAtomically(updated.path, input.body, updated.id);
    mirrorWasUpdated = true;
    await tx.commit();
    return { status: "applied", document: updated, filePath };
  } catch (error) {
    let mirrorRestoreError: unknown;
    if (mirrorWasUpdated && before) {
      try {
        await input.mirror.writeDocumentAtomically(before.path, before.body, before.id);
      } catch (restoreError) {
        mirrorRestoreError = restoreError;
      }
    }
    await tx.rollback();
    if (mirrorRestoreError) {
      throw new AggregateError([error, mirrorRestoreError], "document write failed and mirror restore failed");
    }
    throw error;
  }
}

export async function reconcileWorkspace(input: {
  store: WorkspaceDocumentStore;
  mirror: WorkspaceFileMirror;
  documentPath?: string;
}): Promise<ReconcileResult[]> {
  const documents = await input.store.listDocuments();
  const filtered = input.documentPath ? documents.filter((doc) => doc.path === input.documentPath) : documents;
  const results: ReconcileResult[] = [];

  for (const document of filtered) {
    if (!(await input.mirror.exists(document.path))) {
      const conflict = {
        docId: document.id,
        path: document.path,
        reason: "missing_file" as const,
        dbRev: document.rev,
        dbBodySha256: document.bodySha256
      };
      await input.store.recordConflict(conflict);
      results.push({ status: "conflict", conflict });
      continue;
    }

    const fsBody = await input.mirror.readDocument(document.path);
    const fsBodySha256 = sha256Hex(fsBody);
    if (fsBodySha256 === document.bodySha256) {
      results.push({ status: "unchanged", document });
      continue;
    }

    if (document.lastEditor === "human" && !document.hasPendingPatch) {
      const updated = await input.store.fastForwardExternalEdit({
        docId: document.id,
        expectedRev: document.rev,
        body: fsBody
      });
      if (updated && updated !== "conflict") {
        results.push({ status: "fast_forwarded", document: updated });
        continue;
      }
    }

    const conflict = {
      docId: document.id,
      path: document.path,
      reason: document.lastEditor === "agent" || document.hasPendingPatch ? "external_edit_after_agent" : "rev_conflict",
      dbRev: document.rev,
      dbBodySha256: document.bodySha256,
      fsBodySha256
    } satisfies WorkspaceSyncConflict;
    await input.store.recordConflict(conflict);
    results.push({ status: "conflict", conflict });
  }

  return results;
}
