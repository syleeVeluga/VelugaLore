import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrations } from "./index.js";

const databaseUrl = process.env.WEKI_TEST_DATABASE_URL;
const runIntegration = Boolean(databaseUrl);
const { Client } = pg;

async function query(client: pg.Client, sql: string, params: unknown[] = []) {
  return client.query(sql, params);
}

async function setLocalConfig(client: pg.Client, key: string, value: string): Promise<void> {
  await query(client, "SELECT set_config($1, $2, true)", [key, value]);
}

async function setActorContext(client: pg.Client, userId: string): Promise<void> {
  await query(client, "SET LOCAL ROLE weki_app_tester");
  await setLocalConfig(client, "app.user_id", userId);
  await query(client, "SET LOCAL row_security = on");
}

describe.skipIf(!runIntegration)("S-02 Postgres RLS integration", () => {
  let client: pg.Client;
  const ids = {
    org: "00000000-0000-0000-0000-000000000001",
    otherOrg: "00000000-0000-0000-0000-000000000003",
    workspace: "00000000-0000-0000-0000-000000000002",
    otherWorkspace: "00000000-0000-0000-0000-000000000004",
    owner: "00000000-0000-0000-0000-000000000010",
    admin: "00000000-0000-0000-0000-000000000011",
    editor: "00000000-0000-0000-0000-000000000012",
    reader: "00000000-0000-0000-0000-000000000013",
    outsider: "00000000-0000-0000-0000-000000000014",
    doc: "00000000-0000-0000-0000-000000000020",
    otherDoc: "00000000-0000-0000-0000-000000000021",
    run: "00000000-0000-0000-0000-000000000022",
    patch: "00000000-0000-0000-0000-000000000023",
    raw: "00000000-0000-0000-0000-000000000030"
  };

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await query(client, "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;");
    await query(client, await migrations[0]!.readSql());
    await query(client, "DROP ROLE IF EXISTS weki_app_tester");
    await query(client, "CREATE ROLE weki_app_tester");
    await query(client, "GRANT USAGE ON SCHEMA public TO weki_app_tester");
    await query(client, "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO weki_app_tester");
    await query(client, "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO weki_app_tester");
    await query(client, "GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO weki_app_tester");
    await query(client, "INSERT INTO orgs (id, slug, name) VALUES ($1, 'test-org', 'Test Org'), ($2, 'other-org', 'Other Org')", [
      ids.org,
      ids.otherOrg
    ]);
    await query(
      client,
      `INSERT INTO users (id, email, name) VALUES
        ($1, 'owner@example.com', 'Owner'),
        ($2, 'admin@example.com', 'Admin'),
        ($3, 'editor@example.com', 'Editor'),
        ($4, 'reader@example.com', 'Reader'),
        ($5, 'outsider@example.com', 'Outsider')`,
      [ids.owner, ids.admin, ids.editor, ids.reader, ids.outsider]
    );
    await query(
      client,
      `INSERT INTO memberships (org_id, user_id, role) VALUES
        ($1, $2, 'owner'),
        ($1, $3, 'admin'),
        ($1, $4, 'editor'),
        ($1, $5, 'reader')`,
      [ids.org, ids.owner, ids.admin, ids.editor, ids.reader]
    );
    await query(client, "INSERT INTO workspaces (id, org_id, name) VALUES ($1, $2, 'Main'), ($3, $4, 'Other')", [
      ids.workspace,
      ids.org,
      ids.otherWorkspace,
      ids.otherOrg
    ]);
    await query(
      client,
      "INSERT INTO documents (id, workspace_id, path, title, kind, body, body_sha256, created_by) VALUES ($1, $2, 'wiki/test.md', 'Test', 'concept', 'before', digest('before', 'sha256'), $3)",
      [ids.doc, ids.workspace, ids.editor]
    );
    await query(
      client,
      "INSERT INTO documents (id, workspace_id, path, title, kind, body, body_sha256, created_by) VALUES ($1, $2, 'wiki/other.md', 'Other', 'concept', 'other', digest('other', 'sha256'), $3)",
      [ids.otherDoc, ids.otherWorkspace, ids.editor]
    );
    await query(
      client,
      "INSERT INTO agent_runs (id, workspace_id, agent_id, invoked_by, invocation, status) VALUES ($1, $2, 'draft', $3, '{}'::jsonb, 'queued')",
      [ids.run, ids.workspace, ids.editor]
    );
    await query(
      client,
      "INSERT INTO patches (id, agent_run_id, ops, preview_html, status) VALUES ($1, $2, '[]'::jsonb, '<div>preview</div>', 'proposed')",
      [ids.patch, ids.run]
    );
    await query(
      client,
      "INSERT INTO raw_sources (id, workspace_id, uri, mime, sha256, bytes, imported_by) VALUES ($1, $2, 'file://raw.md', 'text/markdown', digest('raw', 'sha256'), 3, $3)",
      [ids.raw, ids.workspace, ids.editor]
    );
    await query(client, "ALTER TABLE documents FORCE ROW LEVEL SECURITY;");
  });

  afterAll(async () => {
    await client?.end();
  });

  it("allows readers to read but rejects document writes", async () => {
    await query(client, "BEGIN");
    await setActorContext(client, ids.reader);

    const read = await query(client, "SELECT id FROM documents WHERE id = $1", [ids.doc]);
    expect(read.rowCount).toBe(1);

    const write = await query(client, "SELECT app_update_document_body($1, 1, 'reader edit') AS updated", [ids.doc]);
    expect(write.rows[0]?.updated).toBe(false);
    const audit = await query(client, "SELECT action FROM audit_log WHERE action = 'write_denied'");
    expect(audit.rowCount).toBe(1);
    await query(client, "ROLLBACK");
  });

  it("allows editors to update documents", async () => {
    await query(client, "BEGIN");
    await setActorContext(client, ids.editor);
    const write = await query(
      client,
      "UPDATE documents SET body = 'editor edit', body_sha256 = digest('editor edit', 'sha256') WHERE id = $1",
      [ids.doc]
    );
    expect(write.rowCount).toBe(1);
    await query(client, "ROLLBACK");
  });

  it("hides workspace rows from non-members", async () => {
    await query(client, "BEGIN");
    await setActorContext(client, ids.outsider);
    const read = await query(client, "SELECT id FROM documents WHERE id = $1", [ids.doc]);
    expect(read.rowCount).toBe(0);
    await query(client, "ROLLBACK");
  });

  it("rejects raw_sources updates for every role", async () => {
    await query(client, "BEGIN");
    await setActorContext(client, ids.owner);
    const write = await query(client, "UPDATE raw_sources SET uri = 'file://changed.md' WHERE id = $1", [ids.raw]);
    expect(write.rowCount).toBe(0);
    await query(client, "ROLLBACK");
  });

  it("rejects cross-workspace links and immutable agent run edits", async () => {
    await query(client, "BEGIN");
    await setActorContext(client, ids.editor);
    await expect(
      query(client, "INSERT INTO links (src_doc_id, dst_doc_id) VALUES ($1, $2)", [ids.doc, ids.otherDoc])
    ).rejects.toThrow(/same workspace/);
    await query(client, "ROLLBACK");

    await query(client, "BEGIN");
    await setActorContext(client, ids.editor);
    await expect(query(client, "UPDATE agent_runs SET invocation = '{\"changed\":true}'::jsonb WHERE id = $1", [ids.run])).rejects.toThrow(
      /append-only/
    );
    await query(client, "ROLLBACK");
  });

  it("persists patch decisions and writes an audit row", async () => {
    await query(client, "BEGIN");
    await setActorContext(client, ids.editor);

    const decided = await query(client, "SELECT app_decide_patch($1, 'applied', 'looks good') AS decided", [ids.patch]);
    expect(decided.rows[0]?.decided).toBe(true);

    const patch = await query(client, "SELECT status, decided_by FROM patches WHERE id = $1", [ids.patch]);
    expect(patch.rows[0]).toMatchObject({ status: "applied", decided_by: ids.editor });

    const audit = await query(client, "SELECT action, target_id FROM audit_log WHERE target_id = $1", [ids.patch]);
    expect(audit.rows[0]).toMatchObject({ action: "patch.applied", target_id: ids.patch });
    await query(client, "ROLLBACK");
  });
});
