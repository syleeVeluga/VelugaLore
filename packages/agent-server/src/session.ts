import {
  parseDevActAsRole,
  resolveDevActAsRole,
  type DevActAsRole
} from "@weki/core";

export const defaultSoloUserId = "00000000-0000-4000-8000-000000000001";

export type AgentSessionContext = {
  userId: string;
  actedAsRole?: DevActAsRole;
};

export type AgentSessionSqlClient = {
  query<Row>(sql: string, values?: unknown[]): Promise<{ rows: Row[] }>;
};

export type ApplyAgentSessionSqlContextOptions = {
  local?: boolean;
};

export type ResolveAgentSessionContextInput = {
  env?: NodeJS.ProcessEnv;
  nodeEnv?: string;
  userId?: string;
  requestActAsRole?: unknown;
};

export function resolveAgentSessionContext(input: ResolveAgentSessionContextInput = {}): AgentSessionContext {
  const env = input.env ?? process.env;
  const isProduction = (input.nodeEnv ?? env.NODE_ENV) === "production";
  const envActAsRole = resolveDevActAsRole({
    value: env.WEKI_DEV_AS_ROLE,
    isProduction
  });
  const requestActAsRole = resolveDevActAsRole({
    value: input.requestActAsRole,
    isProduction
  });
  const hasRequestActAsRole = input.requestActAsRole !== undefined;

  return {
    userId: input.userId ?? env.WEKI_SOLO_USER_ID ?? defaultSoloUserId,
    actedAsRole: hasRequestActAsRole ? requestActAsRole : envActAsRole
  };
}

export async function applyAgentSessionSqlContext(
  client: AgentSessionSqlClient,
  context: AgentSessionContext,
  options: ApplyAgentSessionSqlContextOptions = {}
): Promise<void> {
  const local = options.local ?? false;
  await client.query("SELECT set_config('app.user_id', $1, $2)", [context.userId, local]);
  await client.query("SELECT set_config('app.dev_act_as_enabled', $1, $2)", [
    context.actedAsRole ? "true" : "false",
    local
  ]);
  await client.query("SELECT set_config('app.role_override', $1, $2)", [context.actedAsRole ?? "", local]);
}

export function requestActAsRoleFromHeader(value: string | string[] | undefined): DevActAsRole | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  return parseDevActAsRole(Array.isArray(value) ? value[0] : value) ?? null;
}
