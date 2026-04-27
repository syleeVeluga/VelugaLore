import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { DevActAsRole } from "@weki/core";
import type {
  ApplyPatchDecision,
  ApplyPatchResponse,
  ManualPageMetadata,
  OpenWorkspaceResponse,
  PendingApproval,
  ReadDocResponse
} from "../desktop-session.js";
import type { WorkspaceDocumentRecord } from "../workspace-sync.js";

export type DesktopApi = {
  pickWorkspaceDirectory(): Promise<string | undefined>;
  openWorkspace(path: string): Promise<OpenWorkspaceResponse>;
  listDocuments(): Promise<WorkspaceDocumentRecord[]>;
  createDoc(path: string, body?: string): Promise<WorkspaceDocumentRecord>;
  createFolder(path: string): Promise<WorkspaceDocumentRecord>;
  renameDoc(docId: string, title: string): Promise<WorkspaceDocumentRecord>;
  moveDoc(docId: string, folderPath: string): Promise<WorkspaceDocumentRecord>;
  duplicateDoc(docId: string, path?: string): Promise<WorkspaceDocumentRecord>;
  archiveDoc(docId: string): Promise<WorkspaceDocumentRecord>;
  restoreDoc(docId: string, path?: string): Promise<WorkspaceDocumentRecord>;
  updateDocMetadata(docId: string, metadata: ManualPageMetadata): Promise<WorkspaceDocumentRecord>;
  readDoc(docId: string): Promise<ReadDocResponse>;
  runDraft(input: { docId: string; prompt: string; body: string; path: string }): Promise<{ id: string; status: string }>;
  listPendingApprovals(): Promise<PendingApproval[]>;
  applyPatch(runId: string, decision: ApplyPatchDecision): Promise<ApplyPatchResponse>;
  setDevActAsRole?(role: DevActAsRole | undefined): void;
};

export function createTauriDesktopApi(): DesktopApi {
  let workspace: OpenWorkspaceResponse | undefined;
  let devActAsRole: DevActAsRole | undefined;
  const listPendingApprovals = async (): Promise<PendingApproval[]> => {
    if (!workspace) {
      return [];
    }
    return invoke("list_pending_approvals");
  };

  return {
    async pickWorkspaceDirectory() {
      const selected = await openDialog({ directory: true, multiple: false });
      if (Array.isArray(selected)) {
        return selected[0];
      }
      return selected ?? undefined;
    },
    async openWorkspace(path: string) {
      const opened = normalizeOpenWorkspaceResponse(await invoke("open_workspace", { path }));
      workspace = opened;
      return opened;
    },
    listDocuments() {
      return invoke("list_documents");
    },
    createDoc(path: string, body = "") {
      return invoke("create_doc", { path, body });
    },
    createFolder(path: string) {
      return invoke("create_folder", { path });
    },
    renameDoc(docId: string, title: string) {
      return invoke("rename_doc", { docId, title });
    },
    moveDoc(docId: string, folderPath: string) {
      return invoke("move_doc", { docId, folderPath });
    },
    duplicateDoc(docId: string, path?: string) {
      return invoke("duplicate_doc", { docId, path });
    },
    archiveDoc(docId: string) {
      return invoke("archive_doc", { docId });
    },
    restoreDoc(docId: string, path?: string) {
      return invoke("restore_doc", { docId, path });
    },
    updateDocMetadata(docId: string, metadata: ManualPageMetadata) {
      return invoke("update_doc_metadata", { docId, metadata });
    },
    readDoc(docId: string) {
      return invoke("read_doc", { docId });
    },
    async runDraft(input) {
      if (!workspace) {
        throw new Error("Workspace is not open.");
      }
      const response = await fetch(`http://127.0.0.1:${workspace.agentServerPort}/runs`, {
        method: "POST",
        headers: agentServerHeaders(devActAsRole),
        body: JSON.stringify({
          workspaceId: workspace.workspaceId,
          agentId: "draft",
          input: input.prompt,
          invokedBy: workspace.userId,
          context: {
            docId: input.docId,
            path: input.path,
            title: input.path.replace(/\.md$/, ""),
            body: input.body
          }
        })
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      return (await response.json()) as { id: string; status: string };
    },
    listPendingApprovals,
    async applyPatch(runId: string, decision: ApplyPatchDecision) {
      if (!workspace) {
        throw new Error("Workspace is not open.");
      }

      const pending = await listPendingApprovals();
      const patch = pending.find((item) => item.agentRunId === runId);
      if (decision === "reject") {
        if (patch) {
          await decideAgentPatch(workspace.agentServerPort, patch.id, "rejected", workspace.userId, devActAsRole);
        }
        return invoke("apply_patch", { runId, decision });
      }

      const runResponse = await fetch(`http://127.0.0.1:${workspace.agentServerPort}/runs/${runId}`);
      if (!runResponse.ok) {
        throw new Error(await runResponse.text());
      }
      const run = (await runResponse.json()) as { patch?: unknown; invocation?: { context?: { body?: string } } };
      const result = await invoke<ApplyPatchResponse>("apply_patch", {
        runId,
        decision,
        patch: run.patch,
        expectedBody: run.invocation?.context?.body
      });
      if (patch && result.status === "applied") {
        await decideAgentPatch(workspace.agentServerPort, patch.id, "applied", workspace.userId, devActAsRole);
      }
      return result;
    },
    setDevActAsRole(role) {
      if (import.meta.env.DEV) {
        devActAsRole = role;
      }
    }
  };
}

async function decideAgentPatch(
  port: number,
  patchId: string,
  decision: "applied" | "rejected",
  decidedBy: string,
  devActAsRole?: DevActAsRole
): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${port}/patches/${patchId}/decision`, {
    method: "POST",
    headers: agentServerHeaders(devActAsRole),
    body: JSON.stringify({ decision, decidedBy })
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
}

function normalizeOpenWorkspaceResponse(value: unknown): OpenWorkspaceResponse {
  const raw = value as {
    workspaceId?: string;
    workspace_id?: string;
    root?: string;
    agentServerPort?: number;
    agent_server_port?: number;
    defaultMode?: "analyze" | "edit";
    default_mode?: "analyze" | "edit";
    userId?: string;
    user_id?: string;
    displayName?: string;
    display_name?: string;
    mode?: "solo";
    actedAsRole?: OpenWorkspaceResponse["actedAsRole"];
    acted_as_role?: OpenWorkspaceResponse["actedAsRole"];
  };
  return {
    workspaceId: raw.workspaceId ?? raw.workspace_id ?? "",
    root: raw.root ?? "",
    agentServerPort: raw.agentServerPort ?? raw.agent_server_port ?? 0,
    defaultMode: raw.defaultMode ?? raw.default_mode ?? "analyze",
    userId: raw.userId ?? raw.user_id ?? "",
    displayName: raw.displayName ?? raw.display_name ?? "Solo",
    mode: raw.mode ?? "solo",
    actedAsRole: raw.actedAsRole ?? raw.acted_as_role
  };
}

function agentServerHeaders(devActAsRole?: DevActAsRole): HeadersInit {
  const devActAsHeaderName = ["x-weki", "dev", "as", "role"].join("-");
  return {
    "content-type": "application/json",
    ...(import.meta.env.DEV && devActAsRole ? { [devActAsHeaderName]: devActAsRole } : {})
  };
}
