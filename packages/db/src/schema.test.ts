import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  agentRunStatuses,
  auditActorKinds,
  documentKinds,
  docVersionSources,
  importRunStatuses,
  importSourceKinds,
  lastEditors,
  linkKinds,
  membershipRoles,
  patchStatuses,
  tripleSources
} from "@weki/core";
import { dbEnumValues, migrations } from "./index.js";

const tenantTables = [
  "orgs",
  "users",
  "memberships",
  "workspaces",
  "raw_sources",
  "documents",
  "import_runs",
  "links",
  "tags",
  "document_tags",
  "doc_versions",
  "agents",
  "agent_runs",
  "patches",
  "audit_log",
  "triples"
];

async function migrationSql(): Promise<string> {
  return migrations[0]?.readSql() ?? readFile("migrations/0001_initial_schema.sql", "utf8");
}

describe("S-02 schema contract", () => {
  it("keeps drizzle enum values aligned with core domain values", () => {
    expect(dbEnumValues).toEqual({
      membershipRoles,
      documentKinds,
      linkKinds,
      importSourceKinds,
      importRunStatuses,
      docVersionSources,
      agentRunStatuses,
      patchStatuses,
      auditActorKinds,
      lastEditors,
      tripleSources
    });
  });

  it("keeps migration enum constraints aligned with core domain values", async () => {
    const sql = await migrationSql();
    for (const values of Object.values(dbEnumValues)) {
      for (const value of values) {
        expect(sql).toContain(`'${value}'`);
      }
    }
  });

  it("enables RLS for every tenant-aware table", async () => {
    const sql = await migrationSql();
    for (const table of tenantTables) {
      expect(sql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
    }
  });

  it("rejects raw_sources updates at the database layer", async () => {
    const sql = await migrationSql();
    expect(sql).toContain("CREATE OR REPLACE FUNCTION raw_sources_no_update()");
    expect(sql).toContain("CREATE TRIGGER tg_raw_sources_no_update");
    expect(sql).toContain("BEFORE UPDATE ON raw_sources");
    expect(sql).toContain("RAISE EXCEPTION 'raw_sources is immutable'");
  });

  it("preserves append-only run fields and workspace-local document links", async () => {
    const sql = await migrationSql();
    expect(sql).toContain("CREATE OR REPLACE FUNCTION agent_runs_status_only_update()");
    expect(sql).toContain("CREATE TRIGGER tg_agent_runs_status_only_update");
    expect(sql).toContain("agent_runs is append-only except status timestamps and error");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION audit_log_no_update_delete()");
    expect(sql).toContain("CREATE TRIGGER tg_audit_log_no_update");
    expect(sql).toContain("audit_log is append-only");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION links_same_workspace()");
    expect(sql).toContain("CREATE TRIGGER tg_links_same_workspace");
  });

  it("persists patch approval decisions through a terminal state machine and audit log", async () => {
    const sql = await migrationSql();
    expect(sql).toContain("CREATE OR REPLACE FUNCTION patches_state_machine_update()");
    expect(sql).toContain("CREATE TRIGGER tg_patches_state_machine_update");
    expect(sql).toContain("patch decision is terminal");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION app_decide_patch");
    expect(sql).toContain("decision NOT IN ('applied','rejected','superseded')");
    expect(sql).toContain("'patch.applied'");
    expect(sql).toContain("'patch.rejected'");
    expect(sql).toContain("'patch.superseded'");
    expect(sql).toContain("'patches.decide'");
  });

  it("gates document writes to editor-or-higher roles and exposes denied-write auditing", async () => {
    const sql = await migrationSql();
    expect(sql).toContain("CREATE OR REPLACE FUNCTION app_can_write_workspace");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION app_role_override");
    expect(sql).toContain("current_setting('app.dev_act_as_enabled', true) = 'true'");
    expect(sql).toContain("current_setting('app.role_override', true) IN ('owner','admin','editor','reader')");
    expect(sql).toContain("SELECT coalesce(app_role_override(), m.role)");
    expect(sql).toContain("AND m.user_id = app_user_id()");
    expect(sql).toContain("IN ('owner','admin','editor')");
    expect(sql).toContain("CREATE POLICY documents_editor_update ON documents");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION app_audit_write_denied");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION app_update_document_body");
    expect(sql).toContain("'write_denied'");
    expect(sql).toContain("'document.updated'");
    expect(sql).toContain("'acted_as_role', app_role_override()");
  });

  it("hardens security definer functions and keeps sync writes compatible with last_editor", async () => {
    const sql = await migrationSql();
    const securityDefinerFunctions = sql.match(/SECURITY\s+DEFINER/g) ?? [];
    const hardenedSecurityDefinerFunctions =
      sql.match(/SECURITY\s+DEFINER\s+SET\s+search_path\s*=\s*public,\s*pg_temp/g) ?? [];

    expect(securityDefinerFunctions.length).toBeGreaterThan(0);
    expect(hardenedSecurityDefinerFunctions).toHaveLength(securityDefinerFunctions.length);
    expect(sql).toContain("WHEN actor IN ('human', 'agent') THEN actor");
    expect(sql).toContain("ELSE last_editor");
  });
});
