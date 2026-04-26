import { corePackage } from "@weki/core";
import { editorPackage } from "@weki/editor";
import { graphPackage } from "@weki/graph";

export const webPackage = {
  name: "@weki/web",
  responsibility: "Next.js web mirror",
  rendererDependencies: [corePackage.name, editorPackage.name, graphPackage.name]
} as const;
