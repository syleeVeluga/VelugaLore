import type { AgentOutput, AgentRunInvocation, AgentRunStatus } from "@weki/core";
import { randomUUID } from "node:crypto";

export type StoredAgentRun = {
  id: string;
  workspaceId: string;
  agentId: string;
  invokedBy?: string;
  invocation: AgentRunInvocation;
  status: AgentRunStatus;
  patch?: AgentOutput;
  startedAt: Date;
  finishedAt?: Date;
  error?: string;
  parentRunId?: string;
  model?: string;
  costTokens?: number;
  costUsdMicrocents?: bigint;
};

export type CreateAgentRunInput = AgentRunInvocation;

export type CreateAgentRunOptions =
  | {
      status?: "running";
    }
  | {
      status: "succeeded";
      patch: AgentOutput;
      model?: string;
      costTokens?: number;
      costUsdMicrocents?: bigint;
    }
  | {
      status: "failed";
      error: string;
    };

export type FinishAgentRunInput =
  | {
      id: string;
      status: "succeeded";
    }
  | {
      id: string;
      status: "failed";
      error: string;
    };

export interface AgentRunStore {
  create(input: CreateAgentRunInput, options?: CreateAgentRunOptions): Promise<StoredAgentRun>;
  finish(input: FinishAgentRunInput): Promise<StoredAgentRun>;
  get(id: string): Promise<StoredAgentRun | undefined>;
}

export type SqlQueryResult<Row> = {
  rows: Row[];
};

export type AgentRunSqlClient = {
  query<Row>(sql: string, values?: unknown[]): Promise<SqlQueryResult<Row>>;
};

type AgentRunSqlRow = {
  id: string;
  workspace_id: string;
  agent_id: string;
  invoked_by: string | null;
  invocation: AgentRunInvocation;
  status: AgentRunStatus;
  patch: AgentOutput | null;
  started_at: Date | string;
  finished_at: Date | string | null;
  error: string | null;
  parent_run_id: string | null;
  model: string | null;
  cost_tokens: number | null;
  cost_usd_microcents: bigint | string | number | null;
};

function rowToRun(row: AgentRunSqlRow): StoredAgentRun {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    agentId: row.agent_id,
    invokedBy: row.invoked_by ?? undefined,
    invocation: row.invocation,
    status: row.status,
    patch: row.patch ?? undefined,
    startedAt: new Date(row.started_at),
    finishedAt: row.finished_at ? new Date(row.finished_at) : undefined,
    error: row.error ?? undefined,
    parentRunId: row.parent_run_id ?? undefined,
    model: row.model ?? undefined,
    costTokens: row.cost_tokens ?? undefined,
    costUsdMicrocents: row.cost_usd_microcents == null ? undefined : BigInt(row.cost_usd_microcents)
  };
}

function requireOne(rows: AgentRunSqlRow[]): StoredAgentRun {
  const [row] = rows;
  if (!row) {
    throw new Error("Agent run not found");
  }
  return rowToRun(row);
}

export class SqlAgentRunStore implements AgentRunStore {
  constructor(private readonly client: AgentRunSqlClient) {}

  async create(input: CreateAgentRunInput, options: CreateAgentRunOptions = {}): Promise<StoredAgentRun> {
    const id = randomUUID();
    const status = options.status ?? "running";
    const patch = options.status === "succeeded" ? options.patch : null;
    const error = options.status === "failed" ? options.error : null;
    const model = options.status === "succeeded" ? options.model ?? null : null;
    const costTokens = options.status === "succeeded" ? options.costTokens ?? null : null;
    const costUsdMicrocents = options.status === "succeeded" ? options.costUsdMicrocents ?? null : null;
    const finishedAt = status === "running" ? null : new Date();
    const result = await this.client.query<AgentRunSqlRow>(
      `
        INSERT INTO agent_runs (
          id,
          workspace_id,
          agent_id,
          invoked_by,
          invocation,
          status,
          patch,
          started_at,
          finished_at,
          error,
          parent_run_id,
          model,
          cost_tokens,
          cost_usd_microcents
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, now(), $8, $9, $10, $11, $12, $13)
        RETURNING
          id,
          workspace_id,
          agent_id,
          invoked_by,
          invocation,
          status,
          patch,
          started_at,
          finished_at,
          error,
          parent_run_id,
          model,
          cost_tokens,
          cost_usd_microcents
      `,
      [
        id,
        input.workspaceId,
        input.agentId,
        input.invokedBy ?? null,
        input,
        status,
        patch,
        finishedAt,
        error,
        input.parentRunId ?? null,
        model,
        costTokens,
        costUsdMicrocents
      ]
    );
    return requireOne(result.rows);
  }

  async finish(input: FinishAgentRunInput): Promise<StoredAgentRun> {
    const result = await this.client.query<AgentRunSqlRow>(
      `
        UPDATE agent_runs
        SET
          status = $2,
          finished_at = now(),
          error = $3,
          patch = CASE WHEN $2 = 'failed' THEN NULL ELSE patch END
        WHERE id = $1
        RETURNING
          id,
          workspace_id,
          agent_id,
          invoked_by,
          invocation,
          status,
          patch,
          started_at,
          finished_at,
          error,
          parent_run_id,
          model,
          cost_tokens,
          cost_usd_microcents
      `,
      [
        input.id,
        input.status,
        input.status === "failed" ? input.error : null
      ]
    );
    return requireOne(result.rows);
  }

  async get(id: string): Promise<StoredAgentRun | undefined> {
    const result = await this.client.query<AgentRunSqlRow>(
      `
        SELECT
          id,
          workspace_id,
          agent_id,
          invoked_by,
          invocation,
          status,
          patch,
          started_at,
          finished_at,
          error,
          parent_run_id,
          model,
          cost_tokens,
          cost_usd_microcents
        FROM agent_runs
        WHERE id = $1
      `,
      [id]
    );
    const [row] = result.rows;
    return row ? rowToRun(row) : undefined;
  }
}

export class InMemoryAgentRunStore implements AgentRunStore {
  private readonly runs = new Map<string, StoredAgentRun>();

  async create(input: CreateAgentRunInput, options: CreateAgentRunOptions = {}): Promise<StoredAgentRun> {
    const status = options.status ?? "running";
    const run: StoredAgentRun = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      invokedBy: input.invokedBy,
      parentRunId: input.parentRunId,
      invocation: input,
      status,
      patch: options.status === "succeeded" ? options.patch : undefined,
      error: options.status === "failed" ? options.error : undefined,
      model: options.status === "succeeded" ? options.model : undefined,
      costTokens: options.status === "succeeded" ? options.costTokens : undefined,
      costUsdMicrocents: options.status === "succeeded" ? options.costUsdMicrocents : undefined,
      startedAt: new Date(),
      finishedAt: status === "running" ? undefined : new Date()
    };
    this.runs.set(run.id, run);
    return run;
  }

  async finish(input: FinishAgentRunInput): Promise<StoredAgentRun> {
    const current = this.runs.get(input.id);
    if (!current) {
      throw new Error("Agent run not found");
    }

    const updated: StoredAgentRun =
      input.status === "succeeded"
        ? {
            ...current,
            status: "succeeded",
            error: undefined,
            finishedAt: new Date()
          }
        : {
            ...current,
            status: "failed",
            patch: undefined,
            error: input.error,
            finishedAt: new Date()
          };

    this.runs.set(input.id, updated);
    return updated;
  }

  async get(id: string): Promise<StoredAgentRun | undefined> {
    return this.runs.get(id);
  }
}
