import { corePackage } from "@weki/core";
import { editorPackage } from "@weki/editor";
import { graphPackage } from "@weki/graph";
export * from "./workspace-sync.js";
export * from "./desktop-session.js";
export * from "./ipc-contract.js";

export const desktopPackage = {
  name: "@weki/desktop",
  responsibility: "Tauri shell and renderer bridge",
  rendererDependencies: [corePackage.name, editorPackage.name, graphPackage.name]
} as const;
