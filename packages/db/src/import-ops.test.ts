import { describe, expect, it } from "vitest";
import {
  measureImportFidelity,
  measureMarkdownImportFidelity,
  planImportDocuments,
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
        tables: 2
      },
      {
        headings: ["1:Policy", "2:Scope", "2:Procedure"],
        links: [],
        convertedLinks: ["Benefits"],
        tables: 2
      }
    );

    expect(fidelity.overall).toBe(1);
    expect(fidelity.brokenLinks).toEqual([]);
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
});
