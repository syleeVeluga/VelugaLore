import { packageBoundarySchema, type PackageBoundary } from "@weki/core";

export const graphPackage: PackageBoundary = packageBoundarySchema.parse({
  name: "@weki/graph",
  responsibility: "graph view wrapper"
});
