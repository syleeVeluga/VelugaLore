import { z } from "zod";
import { agentRunStatusSchema, documentKindSchema } from "./domain.js";

export const agentOutputKindSchema = z.enum(["Patch", "ReadOnlyAnswer"]);

export const insertSectionTreeOpSchema = z.object({
  kind: z.literal("insert_section_tree"),
  docId: z.string().min(1).optional(),
  position: z.enum(["document_start", "document_end"]).default("document_start"),
  sections: z
    .array(
      z.object({
        heading: z.string().min(1),
        level: z.number().int().min(1).max(6)
      })
    )
    .min(1)
});

const replaceRangeOpBaseSchema = z.object({
  kind: z.literal("replace_range"),
  docId: z.string().min(1),
  from: z.number().int().min(0),
  to: z.number().int().min(0),
  text: z.string().min(1)
});

export const replaceRangeOpSchema = replaceRangeOpBaseSchema.refine((op) => op.from <= op.to, {
  message: "replace_range.from must be less than or equal to replace_range.to",
  path: ["from"]
});

export const appendParagraphOpSchema = z.object({
  kind: z.literal("append_paragraph"),
  docId: z.string().min(1).optional(),
  sectionHeading: z.string().min(1).optional(),
  text: z.string().min(1)
});

export const draftPatchOpSchema = z.union([
  insertSectionTreeOpSchema,
  replaceRangeOpSchema,
  appendParagraphOpSchema
]);

const improveAlternativeIds = ["conservative", "tonal", "concise"] as const;

export const improveAlternativeIdSchema = z.enum(improveAlternativeIds);

export const improveReplaceRangeOpSchema = replaceRangeOpBaseSchema.extend({
  alternativeId: improveAlternativeIdSchema,
  label: z.string().min(1)
}).refine((op) => op.from <= op.to, {
  message: "replace_range.from must be less than or equal to replace_range.to",
  path: ["from"]
});

export const readabilityScoreSchema = z.object({
  sentences: z.number().int().min(1),
  words: z.number().int().min(0),
  fkGrade: z.number()
});

export const improveReadabilityScoresSchema = z.object({
  conservative: readabilityScoreSchema,
  tonal: readabilityScoreSchema,
  concise: readabilityScoreSchema
}).strict();

export const improvePatchSchema = z.object({
  kind: z.literal("Patch"),
  outputSchema: z.literal("ImprovePatch").default("ImprovePatch"),
  agentId: z.literal("improve").default("improve"),
  ops: z.array(improveReplaceRangeOpSchema).length(3),
  readabilityScores: improveReadabilityScoresSchema,
  rationale: z.string(),
  requiresApproval: z.boolean().default(true),
  previewHtml: z.string().optional()
}).superRefine((patch, ctx) => {
  const seen = new Set(patch.ops.map((op) => op.alternativeId));
  const missing = improveAlternativeIds.filter((alternativeId) => !seen.has(alternativeId));
  if (seen.size !== improveAlternativeIds.length || missing.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "ImprovePatch must include exactly one conservative, tonal, and concise alternative",
      path: ["ops"]
    });
  }
});

export const askSourceSchema = z.object({
  docId: z.string().min(1),
  title: z.string().min(1),
  path: z.string().min(1).optional(),
  snippet: z.string().min(1),
  score: z.number().min(0).max(1).optional()
});

export const createDocOpSchema = z.object({
  kind: z.literal("create_doc"),
  docId: z.string().min(1).optional(),
  path: z.string().min(1),
  title: z.string().min(1),
  docKind: documentKindSchema,
  body: z.string().min(1),
  frontmatter: z.record(z.unknown()).default(() => ({}))
});

export const indexEntryPatchSchema = z.object({
  path: z.string().min(1),
  title: z.string().min(1),
  docKind: documentKindSchema,
  sourceDocIds: z.array(z.string().min(1)).default(() => []),
  action: z.enum(["upsert", "remove"]).default("upsert")
});

export const updateIndexOpSchema = z.object({
  kind: z.literal("update_index"),
  indexPath: z.string().min(1).default("wiki/_index.md"),
  entries: z.array(indexEntryPatchSchema).min(1)
});

export const insertLinkOpSchema = z.object({
  kind: z.literal("insert_link"),
  docId: z.string().min(1).optional(),
  targetDocId: z.string().min(1).optional(),
  targetPath: z.string().min(1).optional(),
  alias: z.string().min(1).optional(),
  at: z.number().int().min(0).optional()
}).refine((op) => op.targetDocId || op.targetPath, {
  message: "insert_link requires either targetDocId or targetPath",
  path: ["targetDocId"]
});

export const appendLogOpSchema = z.object({
  kind: z.literal("append_log"),
  logPath: z.string().min(1).default("wiki/log/ingest.md"),
  line: z.string().min(1),
  frontmatter: z.record(z.unknown()).default(() => ({}))
});

export const askQaFrontmatterSchema = z.object({
  kind: z.literal("qa"),
  question: z.string().min(1),
  sources: z.array(z.string().min(1)).min(1),
  confidence: z.number().min(0).max(1)
}).passthrough();

export const askCreateDocOpSchema = createDocOpSchema.extend({
  docKind: z.literal("qa"),
  frontmatter: askQaFrontmatterSchema
});

export const askAnswerPayloadSchema = z.object({
  answerMd: z.string().min(1),
  sources: z.array(askSourceSchema).min(1),
  confidence: z.number().min(0).max(1)
});

export const askPatchSchema = z.object({
  kind: z.literal("Patch"),
  outputSchema: z.literal("AskAnswerPatch").default("AskAnswerPatch"),
  agentId: z.literal("ask").default("ask"),
  ops: z.array(askCreateDocOpSchema).min(1),
  answer: askAnswerPayloadSchema,
  rationale: z.string(),
  requiresApproval: z.boolean().default(true),
  previewHtml: z.string().optional()
});

export const rawSourceRefSchema = z.object({
  rawId: z.string().min(1),
  uri: z.string().min(1),
  mime: z.string().min(1),
  sha256: z.string().min(1),
  bytes: z.number().int().min(0),
  text: z.string().optional()
});

export const ingestDocFrontmatterSchema = z.object({
  kind: z.enum(["summary", "entity", "concept", "source"]),
  sources: z.array(z.string().min(1)).min(1),
  importedAt: z.string().min(1),
  confidence: z.number().min(0).max(1),
  raw: rawSourceRefSchema.omit({ text: true }).optional()
}).passthrough();

export const ingestCreateDocOpSchema = createDocOpSchema.extend({
  docKind: z.enum(["summary", "entity", "concept", "source"]),
  frontmatter: ingestDocFrontmatterSchema
});

export const ingestPatchOpSchema = z.union([
  ingestCreateDocOpSchema,
  updateIndexOpSchema,
  insertLinkOpSchema,
  appendLogOpSchema
]);

export const ingestFanOutSchema = z.object({
  summary: z.number().int().min(1).max(1),
  entities: z.number().int().min(0),
  concepts: z.number().int().min(0),
  updatedExisting: z.number().int().min(0)
});

export const ingestPatchSchema = z.object({
  kind: z.literal("Patch"),
  outputSchema: z.literal("IngestPatch").default("IngestPatch"),
  agentId: z.literal("ingest").default("ingest"),
  ops: z.array(ingestPatchOpSchema).min(3),
  fanOut: ingestFanOutSchema,
  rationale: z.string(),
  requiresApproval: z.boolean().default(true),
  previewHtml: z.string().optional()
}).superRefine((patch, ctx) => {
  const createDocOps = patch.ops.filter((op) => op.kind === "create_doc");
  if (createDocOps.length < 3 || createDocOps.length > 10) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "IngestPatch must create between 3 and 10 wiki nodes for each raw source",
      path: ["ops"]
    });
  }
  const summaryDocOps = createDocOps.filter((op) => op.kind === "create_doc" && op.docKind === "summary");
  if (summaryDocOps.length !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "IngestPatch must include exactly one summary document",
      path: ["ops"]
    });
  }
  if (!patch.ops.some((op) => op.kind === "append_log")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "IngestPatch must append an ingest log entry",
      path: ["ops"]
    });
  }
});

export const patchSchema = z.object({
  kind: z.literal("Patch"),
  ops: z.array(z.unknown()),
  rationale: z.string(),
  requiresApproval: z.boolean().default(true),
  previewHtml: z.string().optional()
});

export const draftPatchSchema = patchSchema.extend({
  outputSchema: z.literal("DraftPatch").default("DraftPatch"),
  agentId: z.literal("draft").default("draft"),
  ops: z.array(draftPatchOpSchema).min(1),
  assumptions: z.array(z.string()).default(() => [])
});

export const readOnlyAnswerSchema = z.object({
  kind: z.literal("ReadOnlyAnswer"),
  answer: z.string(),
  sources: z.array(askSourceSchema).or(z.array(z.unknown())).default(() => []),
  confidence: z.number().min(0).max(1).optional()
});

export const agentOutputSchema = z.discriminatedUnion("kind", [patchSchema, readOnlyAnswerSchema]);

export const agentRunInvocationSchema = z.object({
  workspaceId: z.string().uuid(),
  agentId: z.string().min(1),
  input: z.string().default(""),
  context: z
    .object({
      docId: z.string().min(1).optional(),
      title: z.string().min(1).optional(),
      path: z.string().min(1).optional(),
      body: z.string().optional(),
      documents: z
        .array(
          z.object({
            docId: z.string().min(1),
            title: z.string().min(1),
            path: z.string().min(1).optional(),
            body: z.string()
          })
        )
        .optional(),
      rawSource: rawSourceRefSchema.optional(),
      selection: z
        .object({
          docId: z.string().min(1).optional(),
          from: z.number().int().min(0),
          to: z.number().int().min(0),
          text: z.string().optional()
        })
        .refine((selection) => selection.from <= selection.to, {
          message: "selection.from must be less than or equal to selection.to",
          path: ["from"]
        })
        .nullable()
        .optional()
    })
    .optional(),
  invokedBy: z.string().uuid().optional(),
  parentRunId: z.string().uuid().optional()
});

export const agentRunEventSchema = z.object({
  type: z.enum(["run.created", "run.succeeded", "run.failed", "health"]),
  runId: z.string().uuid().optional(),
  status: agentRunStatusSchema.optional(),
  payload: z.unknown().optional()
});

export type AgentOutput = z.infer<typeof agentOutputSchema>;
export type AgentRunInvocation = z.infer<typeof agentRunInvocationSchema>;
export type AgentRunEvent = z.infer<typeof agentRunEventSchema>;
export type AppendParagraphOp = z.infer<typeof appendParagraphOpSchema>;
export type AskAnswerPayload = z.infer<typeof askAnswerPayloadSchema>;
export type AskCreateDocOp = z.infer<typeof askCreateDocOpSchema>;
export type AskPatch = z.infer<typeof askPatchSchema>;
export type AskQaFrontmatter = z.infer<typeof askQaFrontmatterSchema>;
export type AskSource = z.infer<typeof askSourceSchema>;
export type AppendLogOp = z.infer<typeof appendLogOpSchema>;
export type CreateDocOp = z.infer<typeof createDocOpSchema>;
export type DraftPatch = z.infer<typeof draftPatchSchema>;
export type DraftPatchOp = z.infer<typeof draftPatchOpSchema>;
export type IndexEntryPatch = z.infer<typeof indexEntryPatchSchema>;
export type IngestCreateDocOp = z.infer<typeof ingestCreateDocOpSchema>;
export type IngestDocFrontmatter = z.infer<typeof ingestDocFrontmatterSchema>;
export type IngestFanOut = z.infer<typeof ingestFanOutSchema>;
export type IngestPatch = z.infer<typeof ingestPatchSchema>;
export type IngestPatchOp = z.infer<typeof ingestPatchOpSchema>;
export type ImproveAlternativeId = z.infer<typeof improveAlternativeIdSchema>;
export type ImprovePatch = z.infer<typeof improvePatchSchema>;
export type ImproveReplaceRangeOp = z.infer<typeof improveReplaceRangeOpSchema>;
export type InsertLinkOp = z.infer<typeof insertLinkOpSchema>;
export type InsertSectionTreeOp = z.infer<typeof insertSectionTreeOpSchema>;
export type RawSourceRef = z.infer<typeof rawSourceRefSchema>;
export type ReplaceRangeOp = z.infer<typeof replaceRangeOpSchema>;
export type UpdateIndexOp = z.infer<typeof updateIndexOpSchema>;
