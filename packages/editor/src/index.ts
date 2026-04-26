import { packageBoundarySchema, type PackageBoundary } from "@weki/core";
export * from "./approval-queue.js";
export * from "./slash/index.js";

export const editorPackage: PackageBoundary = packageBoundarySchema.parse({
  name: "@weki/editor",
  responsibility: "CodeMirror and ProseMirror editor bridge"
});
