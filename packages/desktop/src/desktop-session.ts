import {
  agentRunInvocationSchema,
  applyPatchOpsToBody,
  parseDraftPatchOps,
  type AgentOutput,
  type AgentRunInvocation
} from "@weki/core";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile } from "node:fs/promises";
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
};

class MemoryDesktopDocumentStore implements WorkspaceDocumentStore {
  readonly documents = new Map<string, WorkspaceDocumentRecord>();
  readonly versions: DocumentVersionInput[] = [];
  readonly conflicts: WorkspaceSyncConflict[] = [];

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
  private agentServerPort?: number;
  private readonly selfWriteShas = new Map<string, Set<string>>();

  constructor(options: DesktopWorkspaceSessionOptions = {}) {
    this.options = {
      watcherDebounceMs: options.watcherDebounceMs ?? 5000,
      startAgentServer: options.startAgentServer ?? true,
      agentServerCommand: options.agentServerCommand,
      agentServerArgs: options.agentServerArgs,
      agentServerCwd: options.agentServerCwd
    };
  }

  onEvent(listener: (event: DesktopEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async openWorkspace(workspaceRoot: string): Promise<OpenWorkspaceResponse> {
    const root = path.resolve(workspaceRoot);
    await mkdir(path.join(root, ".weki"), { recursive: true });

    this.workspaceRoot = root;
    this.workspaceId = randomUUID();
    this.store = new MemoryDesktopDocumentStore();
    this.mirror = new NodeWorkspaceFileMirror(root);
    await this.loadExistingMarkdown(root);

    if (this.options.startAgentServer) {
      this.agentProcess = await startAgentServerProcess({
        command: this.options.agentServerCommand,
        args: this.options.agentServerArgs,
        cwd: this.options.agentServerCwd
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
      agentServerPort: this.agentServerPort
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
      body,
      rev: 1,
      lastEditor: "human"
    });
    this.suppressSelfWrite(document.path, [document.bodySha256]);
    await mirror.writeDocumentAtomically(document.path, document.body, document.id);
    this.emit({
      type: "doc_changed",
      payload: { doc_id: document.id, rev: document.rev, source: "human" }
    });
    return document;
  }

  async runDraft(input: { docId: string; prompt: string; invokedBy?: string }): Promise<AgentRunResponse> {
    const document = this.requireDocument(input.docId);
    const invocation = agentRunInvocationSchema.parse({
      workspaceId: this.requireWorkspaceId(),
      agentId: "draft",
      input: input.prompt.startsWith("/") ? input.prompt : `/draft ${input.prompt}`.trim(),
      invokedBy: input.invokedBy,
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
        decidedBy: this.requireWorkspaceId()
      })
    });
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
    env: process.env,
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
