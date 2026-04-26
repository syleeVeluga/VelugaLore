import { invoke } from "@tauri-apps/api/core";
import type {
  ApplyPatchDecision,
  ApplyPatchResponse,
  OpenWorkspaceResponse,
  PendingApproval,
  ReadDocResponse
} from "../desktop-session.js";
import type { WorkspaceDocumentRecord } from "../workspace-sync.js";

export type DesktopApi = {
  openWorkspace(path: string): Promise<OpenWorkspaceResponse>;
  listDocuments(): Promise<WorkspaceDocumentRecord[]>;
  createDoc(path: string, body?: string): Promise<WorkspaceDocumentRecord>;
  readDoc(docId: string): Promise<ReadDocResponse>;
  runDraft(input: { docId: string; prompt: string; body: string; path: string }): Promise<{ id: string; status: string }>;
  listPendingApprovals(): Promise<PendingApproval[]>;
  applyPatch(runId: string, decision: ApplyPatchDecision): Promise<ApplyPatchResponse>;
};

export function createTauriDesktopApi(): DesktopApi {
  let workspace: OpenWorkspaceResponse | undefined;
  const listPendingApprovals = async (): Promise<PendingApproval[]> => {
    if (!workspace) {
      return [];
    }
    return invoke("list_pending_approvals");
  };

  return {
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
    readDoc(docId: string) {
      return invoke("read_doc", { docId });
    },
    async runDraft(input) {
      if (!workspace) {
        throw new Error("Workspace is not open.");
      }
      const response = await fetch(`http://127.0.0.1:${workspace.agentServerPort}/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: workspace.workspaceId,
          agentId: "draft",
          input: input.prompt,
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
          await decideAgentPatch(workspace.agentServerPort, patch.id, "rejected", workspace.workspaceId);
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
        await decideAgentPatch(workspace.agentServerPort, patch.id, "applied", workspace.workspaceId);
      }
      return result;
    }
  };
}

async function decideAgentPatch(port: number, patchId: string, decision: "applied" | "rejected", decidedBy: string): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${port}/patches/${patchId}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
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
  };
  return {
    workspaceId: raw.workspaceId ?? raw.workspace_id ?? "",
    root: raw.root ?? "",
    agentServerPort: raw.agentServerPort ?? raw.agent_server_port ?? 0
  };
}
