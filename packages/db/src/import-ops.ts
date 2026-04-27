import { createHash, randomUUID } from "node:crypto";
import type { DocumentKind, ImportSourceKind } from "@weki/core";

export type ImportSqlClient = {
  query<Row>(sql: string, values?: unknown[]): Promise<{ rows: Row[]; rowCount?: number | null }>;
};

export type ImportDocumentInput = {
  originalPath: string;
  body: string;
  title?: string;
  kind?: DocumentKind;
  sourceKind: ImportSourceKind;
};

export type PlannedImportDocument = {
  path: string;
  title: string;
  kind: DocumentKind;
  body: string;
  bodySha256: string;
  frontmatter: {
    _import: {
      run_id: string;
      source_kind: ImportSourceKind;
      original_path: string;
      original_format: string;
      preserved: string[];
      imported_at: string;
    };
  };
};

export type ImportPlanningOptions = {
  runId: string;
  importedAt: string;
  targetDir?: string;
  preserveTree?: boolean;
};

export type MarkdownImportFidelity = {
  headingTreeScore: number;
  linkConversionScore: number;
  tableScore: number;
  overall: number;
  brokenLinks: string[];
};

export type ImportFidelitySnapshot = {
  headings: string[];
  links: string[];
  convertedLinks: string[];
  tables: number;
};

type ImportRunRow = {
  source_kind: ImportSourceKind;
  status: string;
};

type ImportDocRow = {
  id: string;
  path: string;
};

export function planImportDocuments(
  files: readonly ImportDocumentInput[],
  options: ImportPlanningOptions
): PlannedImportDocument[] {
  return files.map((file) => {
    const format = extensionOf(file.originalPath) || (file.sourceKind === "md" ? "md" : file.sourceKind);
    const body = rewriteMarkdownLinks(file.body);
    return {
      path: importedPath(file.originalPath, options),
      title: file.title ?? titleFromPath(file.originalPath),
      kind: file.kind ?? "concept",
      body,
      bodySha256: sha256Hex(body),
      frontmatter: {
        _import: {
          run_id: options.runId,
          source_kind: file.sourceKind,
          original_path: file.originalPath,
          original_format: format,
          preserved: preservedMarkdownFeatures(file.body),
          imported_at: options.importedAt
        }
      }
    };
  });
}

export function rewriteMarkdownLinks(markdown: string): string {
  return markdown.replace(/\[([^\]]+)\]\(([^)]+\.md(?:#[^)]+)?)\)/gi, (_match, label: string, target: string) => {
    const [path, anchor] = target.split("#");
    const title = titleFromPath(path);
    const suffix = anchor ? `#${anchor}` : "";
    return label === title ? `[[${title}${suffix}]]` : `[[${title}${suffix}|${label}]]`;
  });
}

export function measureMarkdownImportFidelity(originalMarkdown: string, importedMarkdown: string): MarkdownImportFidelity {
  return measureImportFidelity(snapshotMarkdown(originalMarkdown), snapshotMarkdown(importedMarkdown));
}

export function measureImportFidelity(
  original: ImportFidelitySnapshot,
  imported: ImportFidelitySnapshot
): MarkdownImportFidelity {
  const headingTreeScore = orderedOverlap(original.headings, imported.headings);
  const linkConversionScore = original.links.length === 0
    ? 1
    : Math.min(1, imported.convertedLinks.length / original.links.length);
  const tableScore = original.tables === 0 ? 1 : Math.min(1, imported.tables / original.tables);
  const brokenLinks = original.links.filter((link) =>
    !imported.convertedLinks.some((convertedLink) => convertedLink.includes(titleFromPath(link)))
  );
  const overall = round2((headingTreeScore * 0.45) + (linkConversionScore * 0.35) + (tableScore * 0.2));

  return {
    headingTreeScore: round2(headingTreeScore),
    linkConversionScore: round2(linkConversionScore),
    tableScore: round2(tableScore),
    overall,
    brokenLinks
  };
}

export async function rollbackImportRun(
  client: ImportSqlClient,
  input: { workspaceId: string; runId: string; invokedBy?: string; rollbackRunId?: string }
): Promise<{ rollbackRunId: string; deletedDocCount: number; deletedPaths: string[] }> {
  const rollbackRunId = input.rollbackRunId ?? randomUUID();
  await client.query("BEGIN");
  try {
    const run = await client.query<ImportRunRow>(
      `
        SELECT source_kind, status
        FROM import_runs
        WHERE id = $1 AND workspace_id = $2
        FOR UPDATE
      `,
      [input.runId, input.workspaceId]
    );
    const existing = run.rows[0];
    if (!existing) {
      throw new Error("IMPORT_RUN_NOT_FOUND");
    }
    if (existing.status === "rolled_back") {
      throw new Error("IMPORT_RUN_ALREADY_ROLLED_BACK");
    }

    const docs = await client.query<ImportDocRow>(
      `
        SELECT id, path
        FROM documents
        WHERE workspace_id = $1
          AND frontmatter #>> '{_import,run_id}' = $2
        FOR UPDATE
      `,
      [input.workspaceId, input.runId]
    );
    const docIds = docs.rows.map((doc) => doc.id);
    const deletedPaths = docs.rows.map((doc) => doc.path);

    if (docIds.length > 0) {
      await client.query("DELETE FROM documents WHERE id = ANY($1::uuid[])", [docIds]);
    }

    await client.query(
      "UPDATE import_runs SET status = 'rolled_back', finished_at = now(), notes = coalesce(notes || E'\\n', '') || $3 WHERE id = $1 AND workspace_id = $2",
      [input.runId, input.workspaceId, `rolled back by ${rollbackRunId}`]
    );
    await client.query(
      `
        INSERT INTO import_runs (
          id, workspace_id, invoked_by, source_kind, source_summary, options,
          status, doc_count, started_at, finished_at, rollback_of, notes
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, '{}'::jsonb, 'succeeded', $6, now(), now(), $7, $8)
      `,
      [
        rollbackRunId,
        input.workspaceId,
        input.invokedBy ?? null,
        existing.source_kind,
        JSON.stringify({ rollback_of: input.runId, deleted_paths: deletedPaths }),
        docIds.length,
        input.runId,
        `Rollback removed ${docIds.length} imported document(s).`
      ]
    );
    await client.query(
      `
        INSERT INTO audit_log (workspace_id, actor_kind, actor_id, action, target_kind, target_id, payload)
        VALUES ($1, 'system', $2, 'import.rollback', 'import_run', $3, $4::jsonb)
      `,
      [
        input.workspaceId,
        input.invokedBy ?? "system",
        input.runId,
        JSON.stringify({ rollback_run_id: rollbackRunId, deleted_doc_count: docIds.length, deleted_paths: deletedPaths })
      ]
    );
    await client.query("COMMIT");
    return { rollbackRunId, deletedDocCount: docIds.length, deletedPaths };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

function snapshotMarkdown(markdown: string): ImportFidelitySnapshot {
  const headings = [...markdown.matchAll(/^(#{1,6})\s+(.+)$/gm)].map((match) => `${match[1].length}:${match[2].trim()}`);
  const links = [...markdown.matchAll(/\[[^\]]+\]\(([^)]+\.md(?:#[^)]+)?)\)/gi)].map((match) => match[1]);
  const convertedLinks = [...markdown.matchAll(/\[\[([^\]]+)\]\]/g)].map((match) => match[1]);
  const tables = markdown.split(/\r?\n/).filter((line) => /^\s*\|.+\|\s*$/.test(line)).length;
  return { headings, links, convertedLinks, tables };
}

function orderedOverlap(original: readonly string[], imported: readonly string[]): number {
  if (original.length === 0) {
    return 1;
  }
  const importedSet = new Set(imported);
  return original.filter((heading) => importedSet.has(heading)).length / original.length;
}

function preservedMarkdownFeatures(markdown: string): string[] {
  const preserved = ["headings"];
  if (/\[[^\]]+\]\([^)]+\.md(?:#[^)]+)?\)/i.test(markdown)) {
    preserved.push("links");
  }
  if (/^\s*\|.+\|\s*$/m.test(markdown)) {
    preserved.push("tables");
  }
  if (/^\s*\d+\.\s+/m.test(markdown)) {
    preserved.push("numbering");
  }
  return preserved;
}

function importedPath(originalPath: string, options: ImportPlanningOptions): string {
  const normalized = originalPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const leaf = options.preserveTree === false ? normalized.split("/").at(-1) ?? normalized : normalized;
  const withMd = leaf.replace(/\.[^.]+$/, ".md");
  return `${options.targetDir ?? "wiki/imported"}/${withMd}`.replace(/\/+/g, "/");
}

function titleFromPath(path: string): string {
  const leaf = path.replace(/\\/g, "/").split("/").filter(Boolean).at(-1) ?? "Imported Document";
  const base = leaf.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
  return base
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)
    .join(" ") || "Imported Document";
}

function extensionOf(path: string): string {
  return path.match(/\.([^.\\/]+)$/)?.[1]?.toLowerCase() ?? "";
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}
