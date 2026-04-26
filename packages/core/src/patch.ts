import { z } from "zod";
import { draftPatchOpSchema, type DraftPatchOp } from "./agent.js";

export const patchPreviewRowSchema = z.object({
  opIndex: z.number().int().min(0),
  opKind: z.string().min(1),
  docId: z.string().min(1).optional(),
  before: z.string(),
  after: z.string()
});

export const patchPreviewSchema = z.object({
  beforeText: z.string(),
  afterText: z.string(),
  rows: z.array(patchPreviewRowSchema),
  previewHtml: z.string()
});

export type PatchPreview = z.infer<typeof patchPreviewSchema>;
export type PatchPreviewRow = z.infer<typeof patchPreviewRowSchema>;

export interface PatchPreviewDocument {
  id: string;
  body: string;
}

export interface RenderPatchPreviewInput {
  document: PatchPreviewDocument;
  ops: readonly DraftPatchOp[];
}

export function renderPatchPreview(input: RenderPatchPreviewInput): PatchPreview {
  const rows: PatchPreviewRow[] = [];
  let current = input.document.body;

  for (const [opIndex, op] of input.ops.entries()) {
    const before = current;
    current = applyPatchOpToBody(current, op, input.document.id);
    rows.push({
      opIndex,
      opKind: op.kind,
      docId: "docId" in op ? op.docId : undefined,
      before,
      after: current
    });
  }

  return patchPreviewSchema.parse({
    beforeText: input.document.body,
    afterText: current,
    rows,
    previewHtml: renderPreviewHtml(rows)
  });
}

export function applyPatchOpsToBody(
  body: string,
  ops: readonly DraftPatchOp[],
  docId = "current-doc"
): string {
  return ops.reduce((current, op) => applyPatchOpToBody(current, op, docId), body);
}

export function parseDraftPatchOps(ops: readonly unknown[]): DraftPatchOp[] {
  return ops.map((op) => draftPatchOpSchema.parse(op));
}

function applyPatchOpToBody(body: string, op: DraftPatchOp, fallbackDocId: string): string {
  switch (op.kind) {
    case "replace_range":
      return applyReplaceRange(body, op);
    case "insert_section_tree":
      return applyInsertSectionTree(body, op.sections, op.position);
    case "append_paragraph":
      return applyAppendParagraph(body, op.text, op.sectionHeading, op.docId ?? fallbackDocId);
  }
}

function applyReplaceRange(body: string, op: Extract<DraftPatchOp, { kind: "replace_range" }>): string {
  if (op.from > body.length || op.to > body.length) {
    throw new RangeError(
      `replace_range out of bounds: from=${op.from} to=${op.to} body.length=${body.length}`
    );
  }

  if (body.slice(op.from, op.to) === op.text) {
    return body;
  }

  const replacedLength = op.to - op.from;
  if (op.text.length > replacedLength && body.slice(op.from, op.from + op.text.length) === op.text) {
    return body;
  }

  return `${body.slice(0, op.from)}${op.text}${body.slice(op.to)}`;
}

function applyInsertSectionTree(
  body: string,
  sections: Extract<DraftPatchOp, { kind: "insert_section_tree" }>["sections"],
  position: "document_start" | "document_end"
): string {
  const block = sections
    .filter((section) => !hasMarkdownHeading(body, section.heading))
    .map((section) => `${"#".repeat(section.level)} ${section.heading}`)
    .join("\n\n");

  if (!block) {
    return body;
  }

  if (!body.trim()) {
    return `${block}\n`;
  }

  return position === "document_start" ? `${block}\n\n${body}` : `${body.replace(/\s+$/, "")}\n\n${block}\n`;
}

function applyAppendParagraph(body: string, text: string, sectionHeading?: string, _docId?: string): string {
  if (body.includes(text)) {
    return body;
  }

  if (!sectionHeading || !body.trim()) {
    return `${body.replace(/\s+$/, "")}${body.trim() ? "\n\n" : ""}${text}\n`;
  }

  const heading = findMarkdownHeading(body, sectionHeading);
  if (!heading) {
    return `${body.replace(/\s+$/, "")}\n\n## ${sectionHeading}\n\n${text}\n`;
  }

  const insertAt = findSectionEnd(body, heading.end, heading.level);
  const prefix = body.slice(0, insertAt).replace(/\s+$/, "");
  const suffix = body.slice(insertAt).replace(/^\s+/, "");
  const inserted = `${prefix}\n\n${text}\n`;
  return suffix ? `${inserted}\n${suffix}` : inserted;
}

function findMarkdownHeading(body: string, heading: string): { level: number; end: number } | undefined {
  const escaped = escapeRegExp(heading);
  const match = new RegExp(`^([#]{1,6})\\s+${escaped}\\s*$`, "im").exec(body);
  if (!match || match.index === undefined) {
    return undefined;
  }

  return {
    level: match[1].length,
    end: match.index + match[0].length
  };
}

function hasMarkdownHeading(body: string, heading: string): boolean {
  return Boolean(findMarkdownHeading(body, heading));
}

function findSectionEnd(body: string, from: number, level: number): number {
  const rest = body.slice(from);
  const match = new RegExp(`\\n#{1,${level}}\\s+`, "m").exec(rest);
  return match?.index === undefined ? body.length : from + match.index;
}

function renderPreviewHtml(rows: readonly PatchPreviewRow[]): string {
  const body = rows
    .map(
      (row) => `<section data-op-index="${row.opIndex}" data-op-kind="${escapeHtml(row.opKind)}">` +
        `<h3>${escapeHtml(row.opKind)}</h3>` +
        `<div class="weki-patch-before"><h4>Before</h4><pre>${escapeHtml(row.before)}</pre></div>` +
        `<div class="weki-patch-after"><h4>After</h4><pre>${escapeHtml(row.after)}</pre></div>` +
        `</section>`
    )
    .join("");
  return `<div class="weki-patch-preview">${body}</div>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
