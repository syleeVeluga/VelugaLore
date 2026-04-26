import { packageBoundarySchema, type PackageBoundary } from "@weki/core";

export const editorPackage: PackageBoundary = packageBoundarySchema.parse({
  name: "@weki/editor",
  responsibility: "CodeMirror and ProseMirror editor bridge"
});
