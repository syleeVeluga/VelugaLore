import { z } from "zod";
import { agentRunStatusSchema } from "./domain.js";

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

export const replaceRangeOpSchema = z.object({
  kind: z.literal("replace_range"),
  docId: z.string().min(1),
  from: z.number().int().min(0),
  to: z.number().int().min(0),
  text: z.string().min(1)
}).refine((op) => op.from <= op.to, {
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
  sources: z.array(z.unknown()).default(() => [])
});

export const agentOutputSchema = z.discriminatedUnion("kind", [patchSchema, readOnlyAnswerSchema]);

export const agentRunInvocationSchema = z.object({
  workspaceId: z.string().uuid(),
  agentId: z.string().min(1),
  input: z.string().default(""),
  context: z
    .object({
      docId: z.string().min(1).optional(),
      body: z.string().optional(),
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
export type DraftPatch = z.infer<typeof draftPatchSchema>;
export type DraftPatchOp = z.infer<typeof draftPatchOpSchema>;
export type InsertSectionTreeOp = z.infer<typeof insertSectionTreeOpSchema>;
export type ReplaceRangeOp = z.infer<typeof replaceRangeOpSchema>;
