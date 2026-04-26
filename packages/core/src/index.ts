import { z } from "zod";
export * from "./agent.js";
export * from "./domain.js";
export * from "./slash/index.js";

export const packageBoundarySchema = z.object({
  name: z.string().min(1),
  responsibility: z.string().min(1)
});

export type PackageBoundary = z.infer<typeof packageBoundarySchema>;

export const corePackage = packageBoundarySchema.parse({
  name: "@weki/core",
  responsibility: "shared schemas, patch logic, slash parser"
});
