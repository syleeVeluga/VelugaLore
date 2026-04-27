import { packageBoundarySchema, type PackageBoundary } from "@weki/core";
export * from "./migrations.js";
export * from "./import-ops.js";
export * from "./ia-ops.js";
export * from "./schema.js";

export const dbPackage: PackageBoundary = packageBoundarySchema.parse({
  name: "@weki/db",
  responsibility: "drizzle schema, migrations, query helpers"
});
