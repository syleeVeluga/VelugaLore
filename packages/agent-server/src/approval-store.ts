import type { AgentOutput, PatchStatus } from "@weki/core";
import { randomUUID } from "node:crypto";
import type { StoredAgentRun } from "./run-store.js";

export type ApprovalDecision = Extract<PatchStatus, "applied" | "rejected" | "superseded">;

export type StoredPatchApproval = {
  id: string;
  agentRunId: string;
  workspaceId: string;
  ops: unknown[];
  previewHtml?: string;
  status: PatchStatus;
  decidedBy?: string;
  decidedAt?: Date;
};

export type ProposePatchInput = {
  run: StoredAgentRun;
  patch: Extract<AgentOutput, { kind: "Patch" }>;
};

export type DecidePatchInput = {
  id: string;
  decision: ApprovalDecision;
  decidedBy: string;
  rationale?: string;
};

export type ListPatchesFilter = {
  status?: PatchStatus;
  workspaceId?: string;
};

export class PatchNotFoundError extends Error {
  readonly code = "PATCH_NOT_FOUND";
  constructor(id: string) {
    super(`Patch ${id} not found`);
    this.name = "PatchNotFoundError";
  }
}

export class PatchDecisionTerminalError extends Error {
  readonly code = "PATCH_DECISION_TERMINAL";
  constructor(id: string, status: PatchStatus) {
    super(`Patch ${id} is already in terminal status ${status}`);
    this.name = "PatchDecisionTerminalError";
  }
}

export class PatchDecisionDeniedError extends Error {
  readonly code = "PATCH_DECISION_DENIED";
  constructor(id: string) {
    super(`Patch ${id} decision was denied`);
    this.name = "PatchDecisionDeniedError";
  }
}

export interface PatchApprovalStore {
  propose(input: ProposePatchInput): Promise<StoredPatchApproval>;
  decide(input: DecidePatchInput): Promise<StoredPatchApproval>;
  get(id: string): Promise<StoredPatchApproval | undefined>;
  list(filter?: ListPatchesFilter): Promise<StoredPatchApproval[]>;
}

export type PatchApprovalSqlClient = {
  query<Row>(sql: string, values?: unknown[]): Promise<{ rows: Row[] }>;
};

type PatchApprovalSqlRow = {
  id: string;
  agent_run_id: string;
  workspace_id: string;
  ops: unknown[];
  preview_html: string | null;
  status: PatchStatus;
  decided_by: string | null;
  decided_at: Date | string | null;
};

type PatchDecisionPrecheckSqlRow = {
  status: PatchStatus;
  can_write: boolean;
};

function rowToPatch(row: PatchApprovalSqlRow): StoredPatchApproval {
  return {
    id: row.id,
    agentRunId: row.agent_run_id,
    workspaceId: row.workspace_id,
    ops: row.ops,
    previewHtml: row.preview_html ?? undefined,
    status: row.status,
    decidedBy: row.decided_by ?? undefined,
    decidedAt: row.decided_at ? new Date(row.decided_at) : undefined
  };
}

function requirePatch(rows: PatchApprovalSqlRow[]): StoredPatchApproval {
  const [row] = rows;
  if (!row) {
    throw new Error("Patch not found");
  }
  return rowToPatch(row);
}

export class SqlPatchApprovalStore implements PatchApprovalStore {
  constructor(private readonly client: PatchApprovalSqlClient) {}

  async propose(input: ProposePatchInput): Promise<StoredPatchApproval> {
    const id = randomUUID();
    const result = await this.client.query<PatchApprovalSqlRow>(
      `
        INSERT INTO patches (id, agent_run_id, ops, preview_html, status)
        VALUES ($1, $2, $3::jsonb, $4, 'proposed')
        RETURNING
          patches.id,
          patches.agent_run_id,
          (SELECT workspace_id FROM agent_runs WHERE agent_runs.id = patches.agent_run_id) AS workspace_id,
          patches.ops,
          patches.preview_html,
          patches.status,
          patches.decided_by,
          patches.decided_at
      `,
      [id, input.run.id, input.patch.ops, input.patch.previewHtml ?? null]
    );
    return requirePatch(result.rows);
  }

  async decide(input: DecidePatchInput): Promise<StoredPatchApproval> {
    await this.client.query("BEGIN");
    try {
      await this.client.query("SELECT set_config('app.user_id', $1, true)", [input.decidedBy]);
      const existing = await this.client.query<PatchDecisionPrecheckSqlRow>(
        `
          SELECT p.status, app_can_write_workspace(ar.workspace_id) AS can_write
          FROM patches p
          JOIN agent_runs ar ON ar.id = p.agent_run_id
          WHERE p.id = $1
          FOR UPDATE OF p
        `,
        [input.id]
      );
      const current = existing.rows[0];
      if (!current) {
        throw new PatchNotFoundError(input.id);
      }
      if (!current.can_write) {
        throw new PatchDecisionDeniedError(input.id);
      }
      if (current.status !== "proposed") {
        throw new PatchDecisionTerminalError(input.id, current.status);
      }

      const decision = await this.client.query<{ decided: boolean }>(
        "SELECT app_decide_patch($1, $2, $3) AS decided",
        [input.id, input.decision, input.rationale ?? null]
      );
      if (!decision.rows[0]?.decided) {
        throw new PatchDecisionDeniedError(input.id);
      }
      const patch = await this.get(input.id);
      if (!patch) {
        throw new PatchNotFoundError(input.id);
      }
      await this.client.query("COMMIT");
      return patch;
    } catch (error) {
      await this.client.query("ROLLBACK");
      throw error;
    }
  }

  async get(id: string): Promise<StoredPatchApproval | undefined> {
    const result = await this.client.query<PatchApprovalSqlRow>(
      `
        SELECT
          patches.id,
          patches.agent_run_id,
          agent_runs.workspace_id,
          patches.ops,
          patches.preview_html,
          patches.status,
          patches.decided_by,
          patches.decided_at
        FROM patches
        JOIN agent_runs ON agent_runs.id = patches.agent_run_id
        WHERE patches.id = $1
      `,
      [id]
    );
    const [row] = result.rows;
    return row ? rowToPatch(row) : undefined;
  }

  async list(filter: ListPatchesFilter = {}): Promise<StoredPatchApproval[]> {
    const result = await this.client.query<PatchApprovalSqlRow>(
      `
        SELECT
          patches.id,
          patches.agent_run_id,
          agent_runs.workspace_id,
          patches.ops,
          patches.preview_html,
          patches.status,
          patches.decided_by,
          patches.decided_at
        FROM patches
        JOIN agent_runs ON agent_runs.id = patches.agent_run_id
        WHERE ($1::text IS NULL OR patches.status = $1)
          AND ($2::uuid IS NULL OR agent_runs.workspace_id = $2)
        ORDER BY patches.decided_at DESC NULLS FIRST, patches.id
      `,
      [filter.status ?? null, filter.workspaceId ?? null]
    );
    return result.rows.map(rowToPatch);
  }
}

export class InMemoryPatchApprovalStore implements PatchApprovalStore {
  private readonly patches = new Map<string, StoredPatchApproval>();

  async propose(input: ProposePatchInput): Promise<StoredPatchApproval> {
    const patch: StoredPatchApproval = {
      id: randomUUID(),
      agentRunId: input.run.id,
      workspaceId: input.run.workspaceId,
      ops: input.patch.ops,
      previewHtml: input.patch.previewHtml,
      status: "proposed"
    };
    this.patches.set(patch.id, patch);
    return patch;
  }

  async decide(input: DecidePatchInput): Promise<StoredPatchApproval> {
    const current = this.patches.get(input.id);
    if (!current) {
      throw new PatchNotFoundError(input.id);
    }
    if (current.status !== "proposed") {
      throw new PatchDecisionTerminalError(input.id, current.status);
    }

    const updated: StoredPatchApproval = {
      ...current,
      status: input.decision,
      decidedBy: input.decidedBy,
      decidedAt: new Date()
    };
    this.patches.set(updated.id, updated);
    return updated;
  }

  async get(id: string): Promise<StoredPatchApproval | undefined> {
    return this.patches.get(id);
  }

  async list(filter: ListPatchesFilter = {}): Promise<StoredPatchApproval[]> {
    return [...this.patches.values()]
      .filter((patch) => !filter.status || patch.status === filter.status)
      .filter((patch) => !filter.workspaceId || patch.workspaceId === filter.workspaceId)
      .sort((a, b) => {
        const aTime = a.decidedAt?.getTime() ?? Number.POSITIVE_INFINITY;
        const bTime = b.decidedAt?.getTime() ?? Number.POSITIVE_INFINITY;
        if (aTime !== bTime) {
          return bTime - aTime;
        }
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
  }
}
