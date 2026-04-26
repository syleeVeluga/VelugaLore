import { corePackage } from "@weki/core";
import { dbPackage } from "@weki/db";
import { markdownLspPackage } from "@weki/markdown-lsp";
export * from "./daemon.js";
export * from "./approval-store.js";
export * from "./ask-agent.js";
export * from "./draft-agent.js";
export * from "./improve-agent.js";
export * from "./run-store.js";
export * from "./tool-allowlist.js";

export const agentServerPackage = {
  name: "@weki/agent-server",
  responsibility: "HTTP and SSE agent daemon",
  internalDependencies: [corePackage.name, dbPackage.name, markdownLspPackage.name]
} as const;
