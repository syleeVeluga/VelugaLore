import { z } from "zod";

export const membershipRoles = ["owner", "admin", "editor", "reader"] as const;
export const documentKinds = [
  "concept",
  "entity",
  "source",
  "overview",
  "index",
  "log",
  "qa",
  "summary",
  "slides",
  "draft",
  "stub"
] as const;
export const linkKinds = ["wikilink", "embed", "citation", "derived_from"] as const;
export const importSourceKinds = [
  "folder",
  "zip",
  "docx",
  "md",
  "notion_export",
  "confluence_export",
  "google_docs",
  "html",
  "mixed"
] as const;
export const importRunStatuses = ["queued", "running", "succeeded", "partial", "failed", "rolled_back"] as const;
export const docVersionSources = ["human", "agent", "sync"] as const;
export const agentRunStatuses = ["queued", "running", "succeeded", "failed", "rejected"] as const;
export const patchStatuses = ["proposed", "applied", "rejected", "superseded"] as const;
export const auditActorKinds = ["user", "agent", "system"] as const;
export const lastEditors = ["human", "agent"] as const;
export const tripleSources = ["agent", "human", "derived"] as const;

export const membershipRoleSchema = z.enum(membershipRoles);
export const documentKindSchema = z.enum(documentKinds);
export const linkKindSchema = z.enum(linkKinds);
export const importSourceKindSchema = z.enum(importSourceKinds);
export const importRunStatusSchema = z.enum(importRunStatuses);
export const docVersionSourceSchema = z.enum(docVersionSources);
export const agentRunStatusSchema = z.enum(agentRunStatuses);
export const patchStatusSchema = z.enum(patchStatuses);
export const auditActorKindSchema = z.enum(auditActorKinds);
export const lastEditorSchema = z.enum(lastEditors);
export const tripleSourceSchema = z.enum(tripleSources);

export type MembershipRole = z.infer<typeof membershipRoleSchema>;
export type DocumentKind = z.infer<typeof documentKindSchema>;
export type LinkKind = z.infer<typeof linkKindSchema>;
export type ImportSourceKind = z.infer<typeof importSourceKindSchema>;
export type ImportRunStatus = z.infer<typeof importRunStatusSchema>;
export type DocVersionSource = z.infer<typeof docVersionSourceSchema>;
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;
export type PatchStatus = z.infer<typeof patchStatusSchema>;
export type AuditActorKind = z.infer<typeof auditActorKindSchema>;
export type LastEditor = z.infer<typeof lastEditorSchema>;
export type TripleSource = z.infer<typeof tripleSourceSchema>;
