export type SoloWorkspaceSqlClient = {
  query<Row>(sql: string, values?: unknown[]): Promise<{ rows: Row[] }>;
};

export type EnsureSoloWorkspaceIdentityInput = {
  workspaceId: string;
  userId: string;
  displayName: string;
  workspaceName: string;
  fsRoot?: string;
};

export type SoloWorkspaceIdentity = {
  workspaceId: string;
  orgId: string;
  userId: string;
  role: "editor";
};

type SoloWorkspaceIdentityRow = {
  workspace_id: string;
  org_id: string;
  user_id: string;
  role: "editor";
};

export async function ensureSoloWorkspaceIdentity(
  client: SoloWorkspaceSqlClient,
  input: EnsureSoloWorkspaceIdentityInput
): Promise<SoloWorkspaceIdentity> {
  const slug = `solo-${input.workspaceId}`;
  const email = `${input.userId}@solo.local.weki.invalid`;
  const result = await client.query<SoloWorkspaceIdentityRow>(
    `
      WITH ensured_org AS (
        INSERT INTO orgs (slug, name)
        VALUES ($1, $2)
        ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
        RETURNING id
      ),
      ensured_user AS (
        INSERT INTO users (id, email, name)
        VALUES ($3, $4, $5)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
        RETURNING id
      ),
      ensured_workspace AS (
        INSERT INTO workspaces (id, org_id, name, fs_root)
        SELECT $6, ensured_org.id, $2, $7
        FROM ensured_org
        ON CONFLICT (org_id, name) DO UPDATE SET fs_root = EXCLUDED.fs_root
        RETURNING id, org_id
      ),
      ensured_membership AS (
        INSERT INTO memberships (org_id, user_id, role)
        SELECT ensured_org.id, ensured_user.id, 'editor'
        FROM ensured_org, ensured_user
        ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'editor'
        RETURNING user_id, role
      )
      SELECT
        ensured_workspace.id AS workspace_id,
        ensured_workspace.org_id,
        ensured_membership.user_id,
        ensured_membership.role
      FROM ensured_workspace, ensured_membership
    `,
    [
      slug,
      input.workspaceName,
      input.userId,
      email,
      input.displayName,
      input.workspaceId,
      input.fsRoot ?? null
    ]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("Failed to ensure Solo workspace identity");
  }

  return {
    workspaceId: row.workspace_id,
    orgId: row.org_id,
    userId: row.user_id,
    role: row.role
  };
}
