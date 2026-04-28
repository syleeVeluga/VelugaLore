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
  remapLinks?: boolean;
  defaultKind?: DocumentKind;
};

export type MarkdownImportFidelity = {
  headingTreeScore: number;
  linkConversionScore: number;
  tableScore: number;
  numberingScore: number;
  overall: number;
  brokenLinks: string[];
};

export type ImportFidelitySnapshot = {
  headings: string[];
  links: string[];
  convertedLinks: string[];
  tables: number;
  numberedItems?: number;
};

export type ImportConflictStrategy = "skip" | "fail";

export type ImportConflict = {
  path: string;
  originalPath: string;
  reason: "path_exists" | "duplicate_input_path";
};

export type PlannedImportRun = {
  runId: string;
  workspaceId: string;
  invokedBy?: string;
  sourceKind: ImportSourceKind;
  sourceSummary: {
    root_path: string;
    file_count: number;
    byte_total: number;
    detected_formats: string[];
    fidelity_overall_avg: number;
    link_conversion_score_avg: number;
    broken_links: string[];
  };
  options: {
    preserve_tree: boolean;
    remap_links: boolean;
    target_dir: string;
    default_kind: DocumentKind;
    conflict_strategy: ImportConflictStrategy;
  };
  status: "succeeded" | "partial" | "failed";
  documents: PlannedImportDocument[];
  conflicts: ImportConflict[];
  fidelityByPath: Record<string, MarkdownImportFidelity>;
  notes: string;
};

export type PlanImportRunOptions = ImportPlanningOptions & {
  workspaceId: string;
  invokedBy?: string;
  sourceKind?: ImportSourceKind;
  conflictStrategy?: ImportConflictStrategy;
  existingPaths?: readonly string[];
};

export type ApplyImportRunInput =
  | { plan: PlannedImportRun }
  | { files: readonly ImportDocumentInput[]; options: PlanImportRunOptions };

export type AppliedImportRun = {
  runId: string;
  status: PlannedImportRun["status"];
  insertedDocCount: number;
  conflictCount: number;
  fidelityOverallAvg: number;
};

type ImportRunRow = {
  source_kind: ImportSourceKind;
  status: string;
};

type ImportDocRow = {
  id: string;
  path: string;
};

type ExistingDocumentPathRow = {
  path: string;
};

export function planImportDocuments(
  files: readonly ImportDocumentInput[],
  options: ImportPlanningOptions
): PlannedImportDocument[] {
  return files.map((file) => {
    const format = extensionOf(file.originalPath) || (file.sourceKind === "md" ? "md" : file.sourceKind);
    const body = options.remapLinks === false ? file.body : rewriteMarkdownLinks(file.body);
    return {
      path: importedPath(file.originalPath, options),
      title: file.title ?? titleFromPath(file.originalPath),
      kind: file.kind ?? options.defaultKind ?? "concept",
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

export function planImportRun(
  files: readonly ImportDocumentInput[],
  options: PlanImportRunOptions
): PlannedImportRun {
  const sourceKind = options.sourceKind ?? inferRunSourceKind(files);
  const conflictStrategy = options.conflictStrategy ?? "skip";
  const targetDir = options.targetDir ?? "wiki/imported";
  const defaultKind = options.defaultKind ?? "concept";
  const planned = planImportDocuments(files, options);
  const existingPaths = new Set((options.existingPaths ?? []).map(normalizePath));
  const seenPaths = new Set<string>();
  const conflicts: ImportConflict[] = [];
  const documents: PlannedImportDocument[] = [];

  for (const doc of planned) {
    const normalized = normalizePath(doc.path);
    if (seenPaths.has(normalized)) {
      conflicts.push({ path: doc.path, originalPath: doc.frontmatter._import.original_path, reason: "duplicate_input_path" });
      continue;
    }
    seenPaths.add(normalized);

    if (existingPaths.has(normalized)) {
      conflicts.push({ path: doc.path, originalPath: doc.frontmatter._import.original_path, reason: "path_exists" });
      continue;
    }

    documents.push(doc);
  }

  const status = conflicts.length === 0
    ? "succeeded"
    : conflictStrategy === "fail"
      ? "failed"
      : "partial";
  const selectedDocuments = status === "failed" ? [] : documents;
  const fidelityByPath = Object.fromEntries(
    planned.map((doc, index) => {
      const original = files[index];
      const fidelity = original
        ? measureMarkdownImportFidelity(original.body, doc.body)
        : measureMarkdownImportFidelity(doc.body, doc.body);
      return [doc.path, fidelity];
    })
  );
  const fidelityValues = Object.values(fidelityByPath);
  const brokenLinks = [...new Set(fidelityValues.flatMap((fidelity) => fidelity.brokenLinks))];

  return {
    runId: options.runId,
    workspaceId: options.workspaceId,
    invokedBy: options.invokedBy,
    sourceKind,
    sourceSummary: {
      root_path: commonRoot(files.map((file) => file.originalPath)),
      file_count: files.length,
      byte_total: files.reduce((sum, file) => sum + Buffer.byteLength(file.body, "utf8"), 0),
      detected_formats: [...new Set(files.map((file) => extensionOf(file.originalPath) || file.sourceKind))].sort(),
      fidelity_overall_avg: average(fidelityValues.map((fidelity) => fidelity.overall)),
      link_conversion_score_avg: average(fidelityValues.map((fidelity) => fidelity.linkConversionScore)),
      broken_links: brokenLinks
    },
    options: {
      preserve_tree: options.preserveTree !== false,
      remap_links: options.remapLinks !== false,
      target_dir: targetDir,
      default_kind: defaultKind,
      conflict_strategy: conflictStrategy
    },
    status,
    documents: selectedDocuments,
    conflicts,
    fidelityByPath,
    notes: importRunNotes(status, conflicts, fidelityValues)
  };
}

export async function applyImportRun(
  client: ImportSqlClient,
  input: ApplyImportRunInput
): Promise<AppliedImportRun> {
  await client.query("BEGIN");
  try {
    const plan = "plan" in input ? input.plan : await planImportRunForApply(client, input.files, input.options);
    await client.query(
      `
        INSERT INTO import_runs (
          id, workspace_id, invoked_by, source_kind, source_summary, options,
          status, doc_count, conflict_count, started_at, notes
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, 'running', 0, $7, now(), $8)
      `,
      [
        plan.runId,
        plan.workspaceId,
        plan.invokedBy ?? null,
        plan.sourceKind,
        JSON.stringify(plan.sourceSummary),
        JSON.stringify(plan.options),
        plan.conflicts.length,
        plan.notes
      ]
    );

    for (const doc of plan.documents) {
      await client.query(
        `
          INSERT INTO documents (
            workspace_id, path, title, kind, body, body_sha256, frontmatter, created_by, last_editor
          )
          VALUES ($1, $2, $3, $4, $5, decode($6, 'hex'), $7::jsonb, $8, 'human')
        `,
        [
          plan.workspaceId,
          doc.path,
          doc.title,
          doc.kind,
          doc.body,
          doc.bodySha256,
          JSON.stringify(doc.frontmatter),
          plan.invokedBy ?? null
        ]
      );
    }

    await client.query(
      `
        UPDATE import_runs
        SET status = $3,
            doc_count = $4,
            conflict_count = $5,
            finished_at = now(),
            notes = $6
        WHERE id = $1 AND workspace_id = $2
      `,
      [plan.runId, plan.workspaceId, plan.status, plan.documents.length, plan.conflicts.length, plan.notes]
    );
    await client.query(
      `
        INSERT INTO audit_log (workspace_id, actor_kind, actor_id, action, target_kind, target_id, payload)
        VALUES ($1, 'user', $2, 'import.run', 'import_run', $3, $4::jsonb)
      `,
      [
        plan.workspaceId,
        plan.invokedBy ?? "system",
        plan.runId,
        JSON.stringify({
          source_summary: plan.sourceSummary,
          status: plan.status,
          doc_count: plan.documents.length,
          conflict_count: plan.conflicts.length,
          conflicts: plan.conflicts
        })
      ]
    );
    await client.query("COMMIT");
    return {
      runId: plan.runId,
      status: plan.status,
      insertedDocCount: plan.documents.length,
      conflictCount: plan.conflicts.length,
      fidelityOverallAvg: plan.sourceSummary.fidelity_overall_avg
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function planImportRunForApply(
  client: ImportSqlClient,
  files: readonly ImportDocumentInput[],
  options: PlanImportRunOptions
): Promise<PlannedImportRun> {
  const plannedPaths = [...new Set(planImportDocuments(files, options).map((doc) => doc.path))];
  if (plannedPaths.length === 0) {
    return planImportRun(files, options);
  }

  const existing = await client.query<ExistingDocumentPathRow>(
    `
      SELECT path
      FROM documents
      WHERE workspace_id = $1
        AND path = ANY($2::text[])
      FOR UPDATE
    `,
    [options.workspaceId, plannedPaths]
  );

  return planImportRun(files, {
    ...options,
    existingPaths: [...(options.existingPaths ?? []), ...existing.rows.map((row) => row.path)]
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
  const originalNumberedItems = original.numberedItems ?? 0;
  const importedNumberedItems = imported.numberedItems ?? 0;
  const numberingScore = originalNumberedItems === 0 ? 1 : Math.min(1, importedNumberedItems / originalNumberedItems);
  const brokenLinks = original.links.filter((link) =>
    !imported.convertedLinks.some((convertedLink) => convertedLink.includes(titleFromPath(link)))
  );
  const overall = round2(
    (headingTreeScore * 0.4) + (linkConversionScore * 0.25) + (tableScore * 0.2) + (numberingScore * 0.15)
  );

  return {
    headingTreeScore: round2(headingTreeScore),
    linkConversionScore: round2(linkConversionScore),
    tableScore: round2(tableScore),
    numberingScore: round2(numberingScore),
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
  const numberedItems = markdown.split(/\r?\n/).filter((line) => /^\s*\d+\.\s+/.test(line)).length;
  return { headings, links, convertedLinks, tables, numberedItems };
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

function inferRunSourceKind(files: readonly ImportDocumentInput[]): ImportSourceKind {
  const kinds = new Set(files.map((file) => file.sourceKind));
  if (kinds.size === 1) {
    return files[0]?.sourceKind ?? "mixed";
  }
  return "mixed";
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

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+/, "").toLowerCase();
}

function commonRoot(paths: readonly string[]): string {
  const splitPaths = paths.map((path) => path.replace(/\\/g, "/").split("/").filter(Boolean));
  const first = splitPaths[0];
  if (!first) {
    return "";
  }
  const parts: string[] = [];
  for (const [index, part] of first.entries()) {
    if (splitPaths.every((segments) => segments[index] === part)) {
      parts.push(part);
      continue;
    }
    break;
  }
  return parts.join("/");
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 1;
  }
  return round2(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function importRunNotes(
  status: PlannedImportRun["status"],
  conflicts: readonly ImportConflict[],
  fidelityValues: readonly MarkdownImportFidelity[]
): string {
  const fidelity = average(fidelityValues.map((value) => value.overall));
  const conflictSummary = conflicts.length === 0
    ? "no conflicts"
    : `${conflicts.length} conflict(s): ${conflicts.map((conflict) => `${conflict.reason}:${conflict.path}`).join(", ")}`;
  return `Import ${status}; fidelity=${fidelity}; ${conflictSummary}.`;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}
