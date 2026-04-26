import { corePackage } from "@weki/core";
import { dbPackage } from "@weki/db";
import { markdownLspPackage } from "@weki/markdown-lsp";

export const agentServerPackage = {
  name: "@weki/agent-server",
  responsibility: "HTTP and SSE agent daemon",
  internalDependencies: [corePackage.name, dbPackage.name, markdownLspPackage.name]
} as const;
