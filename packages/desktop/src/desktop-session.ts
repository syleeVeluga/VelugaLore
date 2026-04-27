import {
  agentRunInvocationSchema,
  applyPatchOpsToBody,
  localUserIdentityFileName,
  localUserIdentitySchema,
  parseDraftPatchOps,
  resolveDevActAsRole,
  type AgentOutput,
  type AgentRunInvocation,
  type DevActAsRole,
  type LocalUserIdentity,
  type WorkspaceInteractionMode
} from "@weki/core";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  applyTwoPhaseDocumentWrite,
  NodeWorkspaceFileMirror,
  sha256Hex,
  type DocumentBodyUpdateInput,
  type DocumentVersionInput,
  type DocumentWriteTransaction,
  type WorkspaceDocumentRecord,
  type WorkspaceDocumentStore,
  type WorkspaceFileMirror,
  type WorkspaceSyncConflict
} from "./workspace-sync.js";

export type DesktopEvent =
  | {
      type: "doc_changed";
      payload: { doc_id: string; rev: number; source: "agent" | "human" | "sync" };
    }
  | {
      type: "agent_run_progress";
      payload: { run_id?: string; phase: string; message?: string; patch_preview?: string };
    }
  | {
      type: "agent_run_completed";
      payload: { run_id: string; patch_id?: string; error?: string };
    };

export type OpenWorkspaceResponse = {
  workspaceId: string;
  root: string;
  agentServerPort: number;
  defaultMode: WorkspaceInteractionMode;
  userId: string;
  displayName: string;
  mode: "solo";
  actedAsRole?: DevActAsRole;
};

export type ReadDocResponse = {
  body: string;
  rev: number;
  bodySha256: string;
};

export type ApplyPatchDecision = "approve" | "reject";

export type ApplyPatchResponse =
  | { status: "applied"; document: WorkspaceDocumentRecord; filePath: string }
  | { status: "rejected"; patchId: string }
  | { status: "conflict"; conflict: WorkspaceSyncConflict }
  | { status: "missing"; docId: string };

export type PendingApproval = {
  id: string;
  agentRunId: string;
  workspaceId: string;
  ops: unknown[];
  previewHtml?: string;
  status: string;
};

export type ManualPageMetadata = {
  kind?: string;
  tags?: string[];
  frontmatter?: Record<string, unknown>;
};

export type AgentRunResponse = {
  id: string;
  workspaceId: string;
  agentId: string;
  status: string;
  patch?: AgentOutput;
  error?: string;
};

export type DesktopWorkspaceSessionOptions = {
  agentServerCommand?: string;
  agentServerArgs?: readonly string[];
  agentServerCwd?: string;
  watcherDebounceMs?: number;
  startAgentServer?: boolean;
  env?: NodeJS.ProcessEnv;
  nodeEnv?: string;
  devActAsRole?: DevActAsRole;
};

class MemoryDesktopDocumentStore implements WorkspaceDocumentStore {
  readonly documents = new Map<string, WorkspaceDocumentRecord>();
  readonly versions: DocumentVersionInput[] = [];
  readonly conflicts: WorkspaceSyncConflict[] = [];
  readonly auditLog: { action: string; docId: string; actorUserId?: string; actedAsRole?: DevActAsRole; payload: Record<string, unknown> }[] = [];

  addDocument(input: Omit<WorkspaceDocumentRecord, "bodySha256"> & { bodySha256?: string }): WorkspaceDocumentRecord {
    const document = {
      ...input,
      bodySha256: input.bodySha256 ?? sha256Hex(input.body)
    } satisfies WorkspaceDocumentRecord;
    this.documents.set(document.id, document);
    this.versions.push({
      docId: document.id,
      rev: document.rev,
      body: document.body,
      bodySha256: document.bodySha256,
      source: document.lastEditor
    });
    return document;
  }

  updateDocumentRecord(
    docId: string,
    update: (current: WorkspaceDocumentRecord) => WorkspaceDocumentRecord,
    action: string,
    payload: Record<string, unknown> & { actor_user_id?: string; acted_as_role?: DevActAsRole }
  ): WorkspaceDocumentRecord {
    const current = this.documents.get(docId);
    if (!current) {
      throw new Error(`Document not found: ${docId}`);
    }
    this.versions.push({
      docId: current.id,
      rev: current.rev,
      body: current.body,
      bodySha256: current.bodySha256,
      source: "human"
    });
    const updated = update(current);
    this.documents.set(docId, updated);
    this.auditLog.push({
      action,
      docId,
      actorUserId: payload.actor_user_id,
      actedAsRole: payload.acted_as_role,
      payload
    });
    return updated;
  }

  async beginWrite(): Promise<DocumentWriteTransaction> {
    const documentsSnapshot = new Map(this.documents);
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
        closed = true;
      },
      rollback: async () => {
        if (!closed) {
          this.documents.clear();
          for (const [key, value] of documentsSnapshot) {
            this.documents.set(key, value);
          }
          this.versions.splice(0, this.versions.length, ...versionsSnapshot);
          closed = true;
        }
      }
    };
  }

  async listDocuments(): Promise<WorkspaceDocumentRecord[]> {
    return [...this.documents.values()].sort((a, b) => a.path.localeCompare(b.path));
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
    } satisfies WorkspaceDocumentRecord;
    this.documents.set(input.docId, updated);
    this.versions.push({
      docId: updated.id,
      rev: updated.rev,
      body: updated.body,
      bodySha256: updated.bodySha256,
      source: "sync"
    });
    return updated;
  }

  async recordConflict(conflict: WorkspaceSyncConflict): Promise<void> {
    this.conflicts.push(conflict);
  }

  getByPath(documentPath: string): WorkspaceDocumentRecord | undefined {
    return [...this.documents.values()].find((document) => document.path === documentPath);
  }
}

export class DesktopWorkspaceSession {
  private readonly listeners = new Set<(event: DesktopEvent) => void>();
  private readonly options: Required<Pick<DesktopWorkspaceSessionOptions, "watcherDebounceMs" | "startAgentServer">> &
    Omit<DesktopWorkspaceSessionOptions, "watcherDebounceMs" | "startAgentServer">;
  private store?: MemoryDesktopDocumentStore;
  private mirror?: WorkspaceFileMirror;
  private watcher?: { close(): Promise<void> };
  private agentProcess?: AgentServerProcess;
  private workspaceRoot?: string;
  private workspaceId?: string;
  private identity?: LocalUserIdentity;
  private actedAsRole?: DevActAsRole;
  private agentServerPort?: number;
  private readonly selfWriteShas = new Map<string, Set<string>>();

  constructor(options: DesktopWorkspaceSessionOptions = {}) {
    this.options = {
      watcherDebounceMs: options.watcherDebounceMs ?? 5000,
      startAgentServer: options.startAgentServer ?? true,
      agentServerCommand: options.agentServerCommand,
      agentServerArgs: options.agentServerArgs,
      agentServerCwd: options.agentServerCwd,
      env: options.env,
      nodeEnv: options.nodeEnv,
      devActAsRole: options.devActAsRole
    };
  }

  onEvent(listener: (event: DesktopEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async openWorkspace(workspaceRoot: string): Promise<OpenWorkspaceResponse> {
    const root = path.resolve(workspaceRoot);
    await mkdir(path.join(root, ".weki"), { recursive: true });
    const defaultMode = await ensureWorkspaceAgentsFile(root);
    const identity = await ensureLocalUserIdentity(root);
    const actedAsRole = resolveDevActAsRole({
      value: this.options.devActAsRole ?? this.options.env?.WEKI_DEV_AS_ROLE,
      isProduction: (this.options.nodeEnv ?? this.options.env?.NODE_ENV ?? process.env.NODE_ENV) === "production"
    });

    this.workspaceRoot = root;
    this.workspaceId = randomUUID();
    this.identity = identity;
    this.actedAsRole = actedAsRole;
    this.store = new MemoryDesktopDocumentStore();
    this.mirror = new NodeWorkspaceFileMirror(root);
    await this.loadExistingMarkdown(root);

    if (this.options.startAgentServer) {
      this.agentProcess = await startAgentServerProcess({
        command: this.options.agentServerCommand,
        args: this.options.agentServerArgs,
        cwd: this.options.agentServerCwd,
        userId: identity.userId,
        actedAsRole,
        env: this.options.env,
        nodeEnv: this.options.nodeEnv
      });
      this.agentServerPort = this.agentProcess.port;
    } else {
      this.agentServerPort = 0;
    }

    this.watcher = await this.mirror.startWatcher(
      (documentPath) => {
        void this.reconcileChangedPath(documentPath);
      },
      this.options.watcherDebounceMs
    );

    return {
      workspaceId: this.workspaceId,
      root,
      agentServerPort: this.agentServerPort,
      defaultMode,
      userId: identity.userId,
      displayName: identity.displayName,
      mode: "solo",
      actedAsRole
    };
  }

  async close(): Promise<void> {
    await this.watcher?.close();
    this.agentProcess?.close();
    this.watcher = undefined;
    this.agentProcess = undefined;
  }

  async listDocuments(): Promise<WorkspaceDocumentRecord[]> {
    return this.requireStore().listDocuments();
  }

  async readDoc(docId: string): Promise<ReadDocResponse> {
    const document = this.requireDocument(docId);
    return {
      body: document.body,
      rev: document.rev,
      bodySha256: document.bodySha256
    };
  }

  async createDoc(input: { path: string; body?: string }): Promise<WorkspaceDocumentRecord> {
    const store = this.requireStore();
    const mirror = this.requireMirror();
    const documentPath = normalizeDocumentPath(input.path);
    const body = input.body ?? "";
    const existing = store.getByPath(documentPath);
    if (existing) {
      return existing;
    }

    const document = store.addDocument({
      id: randomUUID(),
      path: documentPath,
      title: titleFromDocumentPath(documentPath),
      kind: "draft",
      body,
      rev: 1,
      lastEditor: "human"
    });
    store.auditLog.push({
      action: "manual.create_doc",
      docId: document.id,
      actorUserId: this.requireIdentity().userId,
      actedAsRole: this.actedAsRole,
      payload: this.auditPayload({ path: document.path })
    });
    this.suppressSelfWrite(document.path, [document.bodySha256]);
    await mirror.writeDocumentAtomically(document.path, document.body, document.id);
    this.emit({
      type: "doc_changed",
      payload: { doc_id: document.id, rev: document.rev, source: "human" }
    });
    return document;
  }

  async createFolder(input: { path: string }): Promise<WorkspaceDocumentRecord> {
    const folderPath = normalizeFolderPath(input.path);
    const indexPath = `${folderPath}/_index.md`;
    const created = await this.createDoc({ path: indexPath, body: `# ${titleFromDocumentPath(folderPath)}\n` });
    return this.requireStore().updateDocumentRecord(
      created.id,
      (doc) => ({ ...doc, kind: "index", title: titleFromDocumentPath(folderPath) }),
      "manual.create_folder",
      this.auditPayload({ path: folderPath, index_path: indexPath })
    );
  }

  async renameDoc(input: { docId: string; title: string }): Promise<WorkspaceDocumentRecord> {
    const store = this.requireStore();
    const mirror = this.requireMirror();
    const current = this.requireDocument(input.docId);
    const oldPath = current.path;
    const newPath = `${path.posix.dirname(oldPath)}/${slugify(input.title)}.md`.replace(/^\.\//, "");
    assertDestinationAvailable(store, mirror, current.id, oldPath, newPath);
    const updated = store.updateDocumentRecord(
      current.id,
      (doc) => ({
        ...doc,
        title: input.title,
        path: newPath,
        rev: doc.rev + 1,
        bodySha256: sha256Hex(doc.body),
        lastEditor: "human"
      }),
      "manual.rename",
      this.auditPayload({ old_path: oldPath, new_path: newPath, title: input.title })
    );
    this.suppressSelfWrite(updated.path, [updated.bodySha256]);
    if (oldPath !== updated.path) {
      await mirror.writeDocumentAtomically(updated.path, updated.body, updated.id);
      await rm(mirror.resolveDocumentPath(oldPath), { force: true }).catch(() => undefined);
    }
    this.emit({ type: "doc_changed", payload: { doc_id: updated.id, rev: updated.rev, source: "human" } });
    return updated;
  }

  async moveDoc(input: { docId: string; folderPath: string }): Promise<WorkspaceDocumentRecord> {
    const store = this.requireStore();
    const mirror = this.requireMirror();
    const current = this.requireDocument(input.docId);
    const oldPath = current.path;
    const folderPath = normalizeFolderPath(input.folderPath);
    const newPath = `${folderPath}/${path.posix.basename(current.path)}`;
    assertDestinationAvailable(store, mirror, current.id, oldPath, newPath);
    const updated = store.updateDocumentRecord(
      current.id,
      (doc) => ({ ...doc, path: newPath, rev: doc.rev + 1, lastEditor: "human" }),
      "manual.move",
      this.auditPayload({ old_path: oldPath, new_path: newPath })
    );
    this.suppressSelfWrite(updated.path, [updated.bodySha256]);
    if (oldPath !== updated.path) {
      await mirror.writeDocumentAtomically(updated.path, updated.body, updated.id);
      await rm(mirror.resolveDocumentPath(oldPath), { force: true }).catch(() => undefined);
    }
    this.emit({ type: "doc_changed", payload: { doc_id: updated.id, rev: updated.rev, source: "human" } });
    return updated;
  }

  async duplicateDoc(input: { docId: string; path?: string }): Promise<WorkspaceDocumentRecord> {
    const current = this.requireDocument(input.docId);
    const store = this.requireStore();
    const mirror = this.requireMirror();
    const duplicatePath = normalizeDocumentPath(input.path ?? nextAvailableCopyPath(store, mirror, current.path));
    if (pathExists(store, mirror, duplicatePath)) {
      throw new Error(`Document path already exists: ${duplicatePath}`);
    }
    const duplicate = await this.createDoc({ path: duplicatePath, body: current.body });
    const updated = this.requireStore().updateDocumentRecord(
      duplicate.id,
      (doc) => ({
        ...doc,
        title: titleFromDocumentPath(duplicatePath),
        kind: current.kind,
        frontmatter: stripImportFrontmatter(current.frontmatter),
        tags: [...(current.tags ?? [])]
      }),
      "manual.duplicate",
      this.auditPayload({ source_doc_id: current.id, path: duplicatePath })
    );
    return updated;
  }

  async archiveDoc(input: { docId: string; permanent?: boolean }): Promise<WorkspaceDocumentRecord | { deleted: true; docId: string }> {
    const current = this.requireDocument(input.docId);
    if (input.permanent) {
      if (hasIncomingLinks(this.requireStore(), current.id)) {
        throw new Error("Cannot permanently delete a document with incoming links.");
      }
      this.requireStore().documents.delete(current.id);
      await rm(this.requireMirror().resolveDocumentPath(current.path), { force: true }).catch(() => undefined);
      return { deleted: true, docId: current.id };
    }
    const archivePath = `wiki/_archive/${path.posix.basename(current.path)}`;
    const archived = await this.moveDoc({ docId: current.id, folderPath: "wiki/_archive" });
    return this.requireStore().updateDocumentRecord(
      archived.id,
      (doc) => ({ ...doc, archivedFrom: current.path, path: archivePath }),
      "manual.archive",
      this.auditPayload({ old_path: current.path, archive_path: archivePath })
    );
  }

  async restoreDoc(input: { docId: string; path?: string }): Promise<WorkspaceDocumentRecord> {
    const current = this.requireDocument(input.docId);
    const store = this.requireStore();
    const mirror = this.requireMirror();
    const oldPath = current.path;
    const restorePath = normalizeDocumentPath(input.path ?? current.archivedFrom ?? current.path.replace(/^wiki\/_archive\//, "wiki/"));
    assertDestinationAvailable(store, mirror, current.id, oldPath, restorePath);
    const restored = store.updateDocumentRecord(
      current.id,
      (doc) => ({ ...doc, path: restorePath, archivedFrom: undefined, rev: doc.rev + 1, lastEditor: "human" }),
      "manual.restore",
      this.auditPayload({ restore_path: restorePath })
    );
    this.suppressSelfWrite(restored.path, [restored.bodySha256]);
    if (oldPath !== restored.path) {
      await mirror.writeDocumentAtomically(restored.path, restored.body, restored.id);
      await rm(mirror.resolveDocumentPath(oldPath), { force: true }).catch(() => undefined);
    }
    this.emit({ type: "doc_changed", payload: { doc_id: restored.id, rev: restored.rev, source: "human" } });
    return restored;
  }

  async updateDocMetadata(input: { docId: string; metadata: ManualPageMetadata }): Promise<WorkspaceDocumentRecord> {
    const updated = this.requireStore().updateDocumentRecord(
      input.docId,
      (doc) => ({
        ...doc,
        kind: input.metadata.kind ?? doc.kind,
        tags: input.metadata.tags ?? doc.tags,
        frontmatter: { ...(doc.frontmatter ?? {}), ...(input.metadata.frontmatter ?? {}) },
        rev: doc.rev + 1,
        bodySha256: sha256Hex(doc.body),
        lastEditor: "human"
      }),
      "manual.metadata",
      this.auditPayload({ metadata: input.metadata })
    );
    this.emit({ type: "doc_changed", payload: { doc_id: updated.id, rev: updated.rev, source: "human" } });
    return updated;
  }

  async runDraft(input: { docId: string; prompt: string; invokedBy?: string }): Promise<AgentRunResponse> {
    const document = this.requireDocument(input.docId);
    const invocation = agentRunInvocationSchema.parse({
      workspaceId: this.requireWorkspaceId(),
      agentId: "draft",
      input: input.prompt.startsWith("/") ? input.prompt : `/draft ${input.prompt}`.trim(),
      invokedBy: input.invokedBy ?? this.requireIdentity().userId,
      context: {
        docId: document.id,
        path: document.path,
        title: path.basename(document.path, path.extname(document.path)),
        body: document.body
      }
    } satisfies AgentRunInvocation);

    this.emit({ type: "agent_run_progress", payload: { phase: "queued", message: "agent.run.queued" } });
    const run = await this.postAgentRun(invocation);
    this.emit({
      type: "agent_run_completed",
      payload: {
        run_id: run.id,
        patch_id: run.patch?.kind === "Patch" ? (await this.findPendingPatchByRun(run.id))?.id : undefined,
        error: run.error
      }
    });
    return run;
  }

  async listPendingApprovals(): Promise<PendingApproval[]> {
    if (!this.agentServerPort) {
      return [];
    }

    const url = new URL(`${this.agentServerBaseUrl()}/patches`);
    url.searchParams.set("status", "proposed");
    url.searchParams.set("workspaceId", this.requireWorkspaceId());
    const response = await fetchJson<{ patches: PendingApproval[] }>(url, { method: "GET" });
    return response.patches;
  }

  async applyPatch(runId: string, decision: ApplyPatchDecision): Promise<ApplyPatchResponse> {
    const pending = await this.findPendingPatchByRun(runId);
    if (!pending) {
      return { status: "missing", docId: runId };
    }

    if (decision === "reject") {
      await this.decidePatch(pending.id, "rejected");
      return { status: "rejected", patchId: pending.id };
    }

    const run = await fetchJson<AgentRunResponse>(`${this.agentServerBaseUrl()}/runs/${runId}`, { method: "GET" });
    if (run.patch?.kind !== "Patch") {
      return { status: "missing", docId: runId };
    }

    const ops = parseDraftPatchOps(run.patch.ops);
    const firstDocId = ops.find((op) => "docId" in op && op.docId)?.docId;
    if (!firstDocId) {
      return { status: "missing", docId: runId };
    }

    const document = this.requireDocument(firstDocId);
    const body = applyPatchOpsToBody(document.body, ops, document.id);
    this.suppressSelfWrite(document.path, [document.bodySha256, sha256Hex(body)]);
    const result = await applyTwoPhaseDocumentWrite({
      store: this.requireStore(),
      mirror: this.requireMirror(),
      docId: document.id,
      expectedRev: document.rev,
      body,
      actor: "agent",
      agentRunId: runId
    });

    if (result.status === "applied") {
      this.requireStore().auditLog.push({
        action: "patch.applied",
        docId: result.document.id,
        actorUserId: this.requireIdentity().userId,
        actedAsRole: this.actedAsRole,
        payload: this.auditPayload({ run_id: runId })
      });
      await this.decidePatch(pending.id, "applied");
      this.emit({
        type: "doc_changed",
        payload: { doc_id: result.document.id, rev: result.document.rev, source: "agent" }
      });
      return result;
    }

    return result;
  }

  private async loadExistingMarkdown(root: string): Promise<void> {
    const store = this.requireStore();
    const files = await listMarkdownFiles(root);

    for (const filePath of files) {
      const documentPath = path.relative(root, filePath).split(path.sep).join("/");
      const body = await readFile(filePath, "utf8");
      store.addDocument({
        id: randomUUID(),
        path: documentPath,
        title: titleFromDocumentPath(documentPath),
        kind: documentPath.endsWith("/_index.md") ? "index" : "draft",
        body,
        rev: 1,
        lastEditor: "human"
      });
    }
  }

  private async reconcileChangedPath(documentPath: string): Promise<void> {
    const store = this.requireStore();
    const mirror = this.requireMirror();
    const current = store.getByPath(documentPath);

    if (!current || !documentPath.endsWith(".md")) {
      return;
    }

    const fsBody = await mirror.readDocument(current.path);
    const fsBodySha256 = sha256Hex(fsBody);
    if (this.selfWriteShas.get(documentPath)?.has(fsBodySha256)) {
      return;
    }

    if (fsBodySha256 === current.bodySha256) {
      return;
    }

    const updated = await store.fastForwardExternalEdit({
      docId: current.id,
      expectedRev: current.rev,
      body: fsBody
    });
    if (updated && updated !== "conflict") {
      this.emit({
        type: "doc_changed",
        payload: { doc_id: updated.id, rev: updated.rev, source: "sync" }
      });
    }
  }

  private async postAgentRun(invocation: AgentRunInvocation): Promise<AgentRunResponse> {
    return fetchJson<AgentRunResponse>(`${this.agentServerBaseUrl()}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(invocation)
    });
  }

  private async findPendingPatchByRun(runId: string): Promise<PendingApproval | undefined> {
    const pending = await this.listPendingApprovals();
    return pending.find((patch) => patch.agentRunId === runId);
  }

  private async decidePatch(patchId: string, decision: "applied" | "rejected"): Promise<void> {
    await fetchJson(`${this.agentServerBaseUrl()}/patches/${patchId}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        decision,
        decidedBy: this.requireIdentity().userId
      })
    });
  }

  private auditPayload(payload: Record<string, unknown>): Record<string, unknown> & { actor_user_id: string; acted_as_role?: DevActAsRole } {
    const identity = this.requireIdentity();
    return {
      ...payload,
      actor_user_id: identity.userId,
      acted_as_role: this.actedAsRole
    };
  }

  private emit(event: DesktopEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private suppressSelfWrite(documentPath: string, bodySha256Values: readonly string[]): void {
    this.selfWriteShas.set(documentPath, new Set(bodySha256Values));
    setTimeout(() => {
      this.selfWriteShas.delete(documentPath);
    }, this.options.watcherDebounceMs + 250);
  }

  private requireStore(): MemoryDesktopDocumentStore {
    if (!this.store) {
      throw new Error("Workspace is not open.");
    }
    return this.store;
  }

  private requireMirror(): WorkspaceFileMirror {
    if (!this.mirror) {
      throw new Error("Workspace is not open.");
    }
    return this.mirror;
  }

  private requireWorkspaceId(): string {
    if (!this.workspaceId) {
      throw new Error("Workspace is not open.");
    }
    return this.workspaceId;
  }

  private requireIdentity(): LocalUserIdentity {
    if (!this.identity) {
      throw new Error("Workspace is not open.");
    }
    return this.identity;
  }

  private requireDocument(docId: string): WorkspaceDocumentRecord {
    const document = this.requireStore().documents.get(docId);
    if (!document) {
      throw new Error(`Document not found: ${docId}`);
    }
    return document;
  }

  private agentServerBaseUrl(): string {
    if (!this.agentServerPort) {
      throw new Error("Agent server is not running.");
    }
    return `http://127.0.0.1:${this.agentServerPort}`;
  }
}

type AgentServerProcess = {
  port: number;
  close(): void;
};

async function startAgentServerProcess(input: {
  command?: string;
  args?: readonly string[];
  cwd?: string;
  userId: string;
  actedAsRole?: DevActAsRole;
  env?: NodeJS.ProcessEnv;
  nodeEnv?: string;
}): Promise<AgentServerProcess> {
  const port = await reserveTcpPort();
  const cwd = input.cwd ?? findRepoRoot(process.cwd());
  const pnpmArgs = [
    ...(input.args ?? ["--filter", "@weki/agent-server", "run", "server", "--"]),
    "--host",
    "127.0.0.1",
    "--port",
    String(port)
  ];
  const { command, args } = input.command
    ? { command: input.command, args: pnpmArgs }
    : resolvePnpmInvocation(pnpmArgs);
  const child = spawn(command, args, {
    cwd,
    env: agentServerEnv(input),
    stdio: ["ignore", "pipe", "pipe"]
  });

  await waitForAgentServerReady(child, port);
  return {
    port,
    close() {
      if (!child.killed) {
        child.kill();
      }
    }
  };
}

function agentServerEnv(input: {
  userId: string;
  actedAsRole?: DevActAsRole;
  env?: NodeJS.ProcessEnv;
  nodeEnv?: string;
}): NodeJS.ProcessEnv {
  const base = input.env ?? process.env;
  const isProduction = (input.nodeEnv ?? base.NODE_ENV) === "production";
  const env: NodeJS.ProcessEnv = {
    ...base,
    WEKI_SOLO_USER_ID: input.userId
  };

  if (!isProduction && input.actedAsRole) {
    env.WEKI_DEV_AS_ROLE = input.actedAsRole;
  } else {
    delete env.WEKI_DEV_AS_ROLE;
  }
  if (isProduction) {
    env.NODE_ENV = "production";
  }

  return env;
}

function resolvePnpmInvocation(pnpmArgs: readonly string[]): { command: string; args: string[] } {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath && existsSync(npmExecPath)) {
    return {
      command: process.execPath,
      args: [npmExecPath, ...pnpmArgs]
    };
  }

  if (process.platform === "win32") {
    const pnpmPs1 = path.join(process.env.APPDATA ?? "", "npm", "pnpm.ps1");
    if (existsSync(pnpmPs1)) {
      return {
        command: "powershell",
        args: ["-ExecutionPolicy", "Bypass", "-File", pnpmPs1, ...pnpmArgs]
      };
    }
  }

  return {
    command: "pnpm",
    args: [...pnpmArgs]
  };
}

async function waitForAgentServerReady(child: ChildProcess, port: number): Promise<void> {
  let stdout = "";
  let stderr = "";

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for agent-server on port ${port}. stderr=${stderr}`));
    }, 15_000);

    if (!child.stdout || !child.stderr) {
      clearTimeout(timeout);
      reject(new Error("agent-server subprocess pipes were not created."));
      return;
    }

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      const lines = stdout.split(/\r?\n/);
      stdout = lines.pop() ?? "";
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as { event?: string; port?: number };
          if (parsed.event === "WEKI_AGENT_SERVER_READY") {
            clearTimeout(timeout);
            resolve();
          }
        } catch {
          // Non-JSON output is ignored; stderr is kept for diagnostics.
        }
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`agent-server exited before ready with code ${code}. stderr=${stderr}`));
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function reserveTcpPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  if (typeof address !== "object" || !address) {
    throw new Error("Failed to reserve an agent-server TCP port.");
  }
  return address.port;
}

async function fetchJson<T>(url: string | URL, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  const json = text.length > 0 ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return json as T;
}

function normalizeDocumentPath(documentPath: string): string {
  const normalized = documentPath.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized.endsWith(".md")) {
    throw new Error(`Document path must end in .md: ${documentPath}`);
  }
  const parts = normalized.split("/");
  if (parts.some((part) => part === ".." || part.length === 0)) {
    throw new Error(`Invalid document path: ${documentPath}`);
  }
  return normalized;
}

function normalizeFolderPath(folderPath: string): string {
  const normalized = folderPath.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  if (!normalized || normalized.split("/").some((part) => part === ".." || part.length === 0)) {
    throw new Error(`Invalid folder path: ${folderPath}`);
  }
  return normalized;
}

function titleFromDocumentPath(documentPath: string): string {
  const normalized = documentPath.replaceAll("\\", "/").replace(/\/_index\.md$/i, "");
  const leaf = normalized.split("/").filter(Boolean).at(-1) ?? "Untitled";
  const base = leaf.replace(/\.md$/i, "").replace(/[-_]+/g, " ");
  return base.split(/\s+/).filter(Boolean).map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`).join(" ") || "Untitled";
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "untitled";
}

function nextAvailableCopyPath(store: MemoryDesktopDocumentStore, mirror: WorkspaceFileMirror, documentPath: string): string {
  const dir = path.posix.dirname(documentPath);
  const ext = path.posix.extname(documentPath) || ".md";
  const base = path.posix.basename(documentPath, ext);
  for (let index = 1; index < 1000; index += 1) {
    const suffix = index === 1 ? "copy" : `copy-${index}`;
    const leaf = `${base}-${suffix}${ext}`;
    const candidate = dir === "." ? leaf : `${dir}/${leaf}`;
    if (!pathExists(store, mirror, candidate)) {
      return candidate;
    }
  }
  throw new Error(`Unable to find available copy path for ${documentPath}`);
}

function assertDestinationAvailable(
  store: MemoryDesktopDocumentStore,
  mirror: WorkspaceFileMirror,
  docId: string,
  oldPath: string,
  newPath: string
): void {
  if (oldPath === newPath) {
    return;
  }
  if ([...store.documents.values()].some((doc) => doc.id !== docId && doc.path === newPath) || existsSync(mirror.resolveDocumentPath(newPath))) {
    throw new Error(`Document path already exists: ${newPath}`);
  }
}

function pathExists(store: MemoryDesktopDocumentStore, mirror: WorkspaceFileMirror, documentPath: string): boolean {
  return [...store.documents.values()].some((doc) => doc.path === documentPath) || existsSync(mirror.resolveDocumentPath(documentPath));
}

function stripImportFrontmatter(frontmatter: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!frontmatter) {
    return undefined;
  }
  const { _import, ...rest } = frontmatter;
  void _import;
  return rest;
}

function hasIncomingLinks(_store: MemoryDesktopDocumentStore, _docId: string): boolean {
  return false;
}

const DEFAULT_WORKSPACE_AGENTS_MD = `# AGENTS.md - WekiDocs workspace rules

## 0. Default mode
default_mode: analyze
`;

async function ensureWorkspaceAgentsFile(root: string): Promise<WorkspaceInteractionMode> {
  const agentsPath = path.join(root, ".weki", "AGENTS.md");
  if (!existsSync(agentsPath)) {
    await writeFile(agentsPath, DEFAULT_WORKSPACE_AGENTS_MD, "utf8");
    return "analyze";
  }

  const body = await readFile(agentsPath, "utf8");
  return parseWorkspaceDefaultMode(body);
}

async function ensureLocalUserIdentity(root: string): Promise<LocalUserIdentity> {
  const userPath = path.join(root, ".weki", localUserIdentityFileName);

  if (existsSync(userPath)) {
    try {
      const parsed = localUserIdentitySchema.safeParse(JSON.parse(await readFile(userPath, "utf8")));
      if (parsed.success) {
        return parsed.data;
      }
    } catch {
      // A corrupt local identity is rebuilt below and kept local to this workspace.
    }
  }

  const identity = localUserIdentitySchema.parse({
    version: 1,
    userId: randomUUID(),
    displayName: os.userInfo().username || "Solo",
    provisionedAt: new Date().toISOString()
  });
  await writeFile(userPath, `${JSON.stringify(identity, null, 2)}\n`, "utf8");
  return identity;
}

function parseWorkspaceDefaultMode(body: string): WorkspaceInteractionMode {
  const match = /^default_mode:\s*(analyze|edit)(?:\s*(?:#.*)?)$/im.exec(body);
  return match?.[1] === "edit" ? "edit" : "analyze";
}

async function listMarkdownFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      if (entry.name === ".weki") {
        return [];
      }
      const full = path.join(root, entry.name);
      if (entry.isDirectory()) {
        return listMarkdownFiles(full);
      }
      return entry.isFile() && entry.name.endsWith(".md") ? [full] : [];
    })
  );
  return files.flat();
}

function findRepoRoot(start: string): string {
  let current = path.resolve(start);

  while (true) {
    if (existsSyncSafe(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("Unable to find repository root for agent-server subprocess.");
    }
    current = parent;
  }
}

function existsSyncSafe(candidate: string): boolean {
  return existsSync(candidate);
}
