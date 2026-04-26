import { z } from "zod";
import { agentRunStatusSchema } from "./domain.js";

export const agentOutputKindSchema = z.enum(["Patch", "ReadOnlyAnswer"]);

export const patchSchema = z.object({
  kind: z.literal("Patch"),
  ops: z.array(z.unknown()),
  rationale: z.string(),
  requiresApproval: z.boolean().default(true),
  previewHtml: z.string().optional()
});

export const readOnlyAnswerSchema = z.object({
  kind: z.literal("ReadOnlyAnswer"),
  answer: z.string(),
  sources: z.array(z.unknown()).default([])
});

export const agentOutputSchema = z.discriminatedUnion("kind", [patchSchema, readOnlyAnswerSchema]);

export const agentRunInvocationSchema = z.object({
  workspaceId: z.string().uuid(),
  agentId: z.string().min(1),
  input: z.string().default(""),
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
