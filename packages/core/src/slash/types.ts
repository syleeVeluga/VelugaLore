export type SlashCommandGroup = "core" | "system" | "ext" | "workspace" | "plugin";
export type WorkspaceInteractionMode = "analyze" | "edit";
export type SlashCommandEffect = "read" | "write";

export type SlashTarget =
  | { kind: "selection"; docId: string; from: number; to: number }
  | { kind: "docs"; docIds: string[] }
  | { kind: "doc"; docId: string }
  | { kind: "path"; path: string }
  | { kind: "query"; query: string };

export type SlashArgValue = string | boolean | number;
export type SlashArg = SlashArgValue | SlashArgValue[];

export interface EditorSelectionContext {
  docId: string;
  from: number;
  to: number;
  text?: string;
}

export interface EditorContext {
  docId: string;
  selection?: EditorSelectionContext | null;
}

export interface SlashInvocation {
  verb: string;
  target?: SlashTarget;
  args: Record<string, SlashArg>;
  freeText?: string;
  raw: string;
}

export interface SlashCommandExample {
  input: string;
  labelKey: string;
}

export interface SlashCommandArgumentValueDefinition {
  value: string;
  labelKey: string;
}

export interface SlashCommandArgumentDefinition {
  name: string;
  labelKey: string;
  values?: readonly SlashCommandArgumentValueDefinition[];
}

export interface SlashCommandDefinition {
  verb: string;
  group: SlashCommandGroup;
  effect: SlashCommandEffect;
  agent?: string;
  summaryKey: string;
  examples: readonly SlashCommandExample[];
  args?: readonly SlashCommandArgumentDefinition[];
  selection: "required" | "optional" | "none";
  multiDoc: boolean;
  defaultApplyMode: string;
}
