import { describe, expect, it } from "vitest";
import {
  applyImportRun,
  measureImportFidelity,
  measureMarkdownImportFidelity,
  planImportDocuments,
  planImportRun,
  rewriteMarkdownLinks,
  rollbackImportRun,
  type ImportSqlClient
} from "./import-ops.js";

describe("S-09a import system operation", () => {
  it("plans markdown imports with import provenance and converted wiki links", () => {
    const [doc] = planImportDocuments(
      [
        {
          originalPath: "handbook/onboarding.md",
          sourceKind: "md",
          body: "# Onboarding\n\nSee [Security](security-policy.md) before access."
        }
      ],
      {
        runId: "11111111-1111-4111-8111-111111111111",
        importedAt: "2026-04-27T00:00:00.000Z",
        targetDir: "wiki/imported",
        preserveTree: true
      }
    );

    expect(doc).toMatchObject({
      path: "wiki/imported/handbook/onboarding.md",
      title: "Onboarding",
      kind: "concept",
      frontmatter: {
        _import: {
          run_id: "11111111-1111-4111-8111-111111111111",
          source_kind: "md",
          original_path: "handbook/onboarding.md",
          original_format: "md",
          preserved: ["headings", "links"],
          imported_at: "2026-04-27T00:00:00.000Z"
        }
      }
    });
    expect(doc?.body).toContain("[[Security Policy|Security]]");
    expect(doc?.bodySha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("measures heading and link fidelity for imported markdown", () => {
    const original = "# Policy\n\n## Scope\n\nSee [Benefits](benefits.md).\n\n| A | B |\n| - | - |";
    const imported = rewriteMarkdownLinks(original);
    const fidelity = measureMarkdownImportFidelity(original, imported);

    expect(fidelity.overall).toBe(1);
    expect(fidelity.headingTreeScore).toBe(1);
    expect(fidelity.linkConversionScore).toBe(1);
    expect(fidelity.brokenLinks).toEqual([]);
  });

  it("measures docx-style structural fidelity after extraction", () => {
    const fidelity = measureImportFidelity(
      {
        headings: ["1:Policy", "2:Scope", "2:Procedure"],
        links: ["Benefits"],
        convertedLinks: [],
        tables: 2,
        numberedItems: 3
      },
      {
        headings: ["1:Policy", "2:Scope", "2:Procedure"],
        links: [],
        convertedLinks: ["Benefits"],
        tables: 2,
        numberedItems: 3
      }
    );

    expect(fidelity.overall).toBe(1);
    expect(fidelity.numberingScore).toBe(1);
    expect(fidelity.brokenLinks).toEqual([]);
  });

  it("plans one import run with partial status, conflict report, and fidelity summary", () => {
    const plan = planImportRun(
      [
        {
          originalPath: "handbook/onboarding.md",
          sourceKind: "md",
          body: "# Onboarding\n\n1. Prepare account\n2. Review [Security](security.md)"
        },
        {
          originalPath: "handbook/security.md",
          sourceKind: "md",
          body: "# Security\n\n| Rule | Owner |\n| - | - |"
        }
      ],
      {
        workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        runId: "11111111-1111-4111-8111-111111111111",
        importedAt: "2026-04-27T00:00:00.000Z",
        targetDir: "wiki/imported",
        preserveTree: true,
        existingPaths: ["wiki/imported/handbook/onboarding.md"],
        conflictStrategy: "skip"
      }
    );

    expect(plan.status).toBe("partial");
    expect(plan.documents).toHaveLength(1);
    expect(plan.conflicts).toEqual([
      {
        path: "wiki/imported/handbook/onboarding.md",
        originalPath: "handbook/onboarding.md",
        reason: "path_exists"
      }
    ]);
    expect(plan.sourceSummary).toMatchObject({
      file_count: 2,
      detected_formats: ["md"],
      fidelity_overall_avg: 1,
      link_conversion_score_avg: 1,
      broken_links: []
    });
    expect(plan.options).toMatchObject({
      preserve_tree: true,
      remap_links: true,
      target_dir: "wiki/imported",
      conflict_strategy: "skip"
    });
    expect(plan.notes).toContain("Import partial");
  });

  it("rolls back all documents attached to one import run in a single transaction", async () => {
    const queries: { sql: string; values?: unknown[] }[] = [];
    const client: ImportSqlClient = {
      async query<Row>(sql: string, values?: unknown[]) {
        queries.push({ sql, values });
        if (sql.includes("FROM import_runs") && sql.includes("FOR UPDATE")) {
          return { rows: [{ source_kind: "md", status: "succeeded" }] as Row[] };
        }
        if (sql.includes("FROM documents") && sql.includes("frontmatter #>>")) {
          return {
            rows: [
              { id: "22222222-2222-4222-8222-222222222222", path: "wiki/imported/a.md" },
              { id: "33333333-3333-4333-8333-333333333333", path: "wiki/imported/b.md" }
            ] as Row[]
          };
        }
        return { rows: [] as Row[] };
      }
    };

    const result = await rollbackImportRun(client, {
      workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      runId: "11111111-1111-4111-8111-111111111111",
      invokedBy: "55555555-5555-4555-8555-555555555555",
      rollbackRunId: "99999999-9999-4999-8999-999999999999"
    });

    expect(result).toEqual({
      rollbackRunId: "99999999-9999-4999-8999-999999999999",
      deletedDocCount: 2,
      deletedPaths: ["wiki/imported/a.md", "wiki/imported/b.md"]
    });
    expect(queries[0]?.sql).toBe("BEGIN");
    expect(queries.some((query) => query.sql.includes("DELETE FROM documents"))).toBe(true);
    expect(queries.some((query) => query.sql.includes("status = 'rolled_back'"))).toBe(true);
    expect(queries.some((query) => query.sql.includes("'import.rollback'"))).toBe(true);
    expect(queries.at(-1)?.sql).toBe("COMMIT");
  });

  it("applies an import run as one transaction with import_runs and editable documents", async () => {
    const queries: { sql: string; values?: unknown[] }[] = [];
    const client: ImportSqlClient = {
      async query<Row>(sql: string, values?: unknown[]) {
        queries.push({ sql, values });
        return { rows: [] as Row[] };
      }
    };
    const plan = planImportRun(
      [
        {
          originalPath: "handbook/onboarding.md",
          sourceKind: "md",
          body: "# Onboarding\n\nSee [Security](security.md)."
        }
      ],
      {
        workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        invokedBy: "55555555-5555-4555-8555-555555555555",
        runId: "11111111-1111-4111-8111-111111111111",
        importedAt: "2026-04-27T00:00:00.000Z",
        targetDir: "wiki/imported",
        preserveTree: true
      }
    );

    const result = await applyImportRun(client, { plan });

    expect(result).toEqual({
      runId: "11111111-1111-4111-8111-111111111111",
      status: "succeeded",
      insertedDocCount: 1,
      conflictCount: 0,
      fidelityOverallAvg: 1
    });
    expect(queries[0]?.sql).toBe("BEGIN");
    expect(queries.some((query) => query.sql.includes("INSERT INTO import_runs"))).toBe(true);
    expect(queries.some((query) => query.sql.includes("INSERT INTO documents"))).toBe(true);
    expect(queries.some((query) => query.sql.includes("last_editor"))).toBe(true);
    expect(queries.some((query) => query.sql.includes("status = $3"))).toBe(true);
    expect(queries.some((query) => query.sql.includes("'import.run'"))).toBe(true);
    expect(queries.at(-1)?.sql).toBe("COMMIT");
  });

  it("detects existing document paths before applying a files/options import run", async () => {
    const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const queries: { sql: string; values?: unknown[] }[] = [];
    const client: ImportSqlClient = {
      async query<Row>(sql: string, values?: unknown[]) {
        queries.push({ sql, values });
        if (sql.includes("SELECT path") && sql.includes("FROM documents")) {
          return {
            rows: [
              { path: "wiki/imported/handbook/onboarding.md" }
            ] as Row[]
          };
        }
        return { rows: [] as Row[] };
      }
    };

    const result = await applyImportRun(client, {
      files: [
        {
          originalPath: "handbook/onboarding.md",
          sourceKind: "md",
          body: "# Onboarding\n\nExisting path."
        },
        {
          originalPath: "handbook/security.md",
          sourceKind: "md",
          body: "# Security\n\nNew path."
        }
      ],
      options: {
        workspaceId,
        invokedBy: "55555555-5555-4555-8555-555555555555",
        runId: "11111111-1111-4111-8111-111111111111",
        importedAt: "2026-04-27T00:00:00.000Z",
        targetDir: "wiki/imported",
        preserveTree: true
      }
    });

    const pathLookup = queries.find((query) => query.sql.includes("SELECT path") && query.sql.includes("FOR UPDATE"));
    const documentInserts = queries.filter((query) => query.sql.includes("INSERT INTO documents"));

    expect(result).toMatchObject({
      status: "partial",
      insertedDocCount: 1,
      conflictCount: 1
    });
    expect(pathLookup?.values).toEqual([
      workspaceId,
      ["wiki/imported/handbook/onboarding.md", "wiki/imported/handbook/security.md"]
    ]);
    expect(documentInserts).toHaveLength(1);
    expect(documentInserts[0]?.values?.[1]).toBe("wiki/imported/handbook/security.md");
    expect(queries.at(-1)?.sql).toBe("COMMIT");
  });
});
