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
    raw: "00000000-0000-0000-0000-000000000030"
  };

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await query(client, "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;");
    await query(client, await migrations[0]!.readSql());
    await query(
      client,
      `
      INSERT INTO orgs (id, slug, name) VALUES ($1, 'test-org', 'Test Org'), ($10, 'other-org', 'Other Org');
      INSERT INTO users (id, email, name) VALUES
        ($2, 'owner@example.com', 'Owner'),
        ($3, 'admin@example.com', 'Admin'),
        ($4, 'editor@example.com', 'Editor'),
        ($5, 'reader@example.com', 'Reader'),
        ($6, 'outsider@example.com', 'Outsider');
      INSERT INTO memberships (org_id, user_id, role) VALUES
        ($1, $2, 'owner'),
        ($1, $3, 'admin'),
        ($1, $4, 'editor'),
        ($1, $5, 'reader');
      INSERT INTO workspaces (id, org_id, name) VALUES ($7, $1, 'Main');
      INSERT INTO workspaces (id, org_id, name) VALUES ($11, $10, 'Other');
      INSERT INTO documents (id, workspace_id, path, title, kind, body, body_sha256, created_by) VALUES
        ($8, $7, 'wiki/test.md', 'Test', 'concept', 'before', digest('before', 'sha256'), $4);
      INSERT INTO documents (id, workspace_id, path, title, kind, body, body_sha256, created_by) VALUES
        ($12, $11, 'wiki/other.md', 'Other', 'concept', 'other', digest('other', 'sha256'), $4);
      INSERT INTO agent_runs (id, workspace_id, agent_id, invoked_by, invocation, status)
        VALUES ($13, $7, 'draft', $4, '{}'::jsonb, 'queued');
      INSERT INTO raw_sources (id, workspace_id, uri, mime, sha256, bytes, imported_by) VALUES
        ($9, $7, 'file://raw.md', 'text/markdown', digest('raw', 'sha256'), 3, $4);
      `,
      [
        ids.org,
        ids.owner,
        ids.admin,
        ids.editor,
        ids.reader,
        ids.outsider,
        ids.workspace,
        ids.doc,
        ids.raw,
        ids.otherOrg,
        ids.otherWorkspace,
        ids.otherDoc,
        ids.run
      ]
    );
    await query(client, "ALTER TABLE documents FORCE ROW LEVEL SECURITY;");
  });

  afterAll(async () => {
    await client?.end();
  });

  it("allows readers to read but rejects document writes", async () => {
    await query(client, "BEGIN");
    await setLocalConfig(client, "app.user_id", ids.reader);
    await query(client, "SET LOCAL row_security = on");

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
    await setLocalConfig(client, "app.user_id", ids.editor);
    await query(client, "SET LOCAL row_security = on");
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
    await setLocalConfig(client, "app.user_id", ids.outsider);
    await query(client, "SET LOCAL row_security = on");
    const read = await query(client, "SELECT id FROM documents WHERE id = $1", [ids.doc]);
    expect(read.rowCount).toBe(0);
    await query(client, "ROLLBACK");
  });

  it("rejects raw_sources updates for every role", async () => {
    await query(client, "BEGIN");
    await setLocalConfig(client, "app.user_id", ids.owner);
    await query(client, "SET LOCAL row_security = on");
    await expect(query(client, "UPDATE raw_sources SET uri = 'file://changed.md' WHERE id = $1", [ids.raw])).rejects.toThrow(
      /raw_sources is immutable/
    );
    await query(client, "ROLLBACK");
  });

  it("rejects cross-workspace links and immutable agent run edits", async () => {
    await query(client, "BEGIN");
    await setLocalConfig(client, "app.user_id", ids.editor);
    await query(client, "SET LOCAL row_security = on");
    await expect(
      query(client, "INSERT INTO links (src_doc_id, dst_doc_id) VALUES ($1, $2)", [ids.doc, ids.otherDoc])
    ).rejects.toThrow(/same workspace/);
    await query(client, "ROLLBACK");

    await query(client, "BEGIN");
    await setLocalConfig(client, "app.user_id", ids.editor);
    await query(client, "SET LOCAL row_security = on");
    await expect(query(client, "UPDATE agent_runs SET invocation = '{\"changed\":true}'::jsonb WHERE id = $1", [ids.run])).rejects.toThrow(
      /append-only/
    );
    await query(client, "ROLLBACK");
  });
});
