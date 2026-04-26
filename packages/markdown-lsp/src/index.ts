import { packageBoundarySchema, type PackageBoundary } from "@weki/core";

export const markdownLspPackage: PackageBoundary = packageBoundarySchema.parse({
  name: "@weki/markdown-lsp",
  responsibility: "markdown diagnostics"
});
