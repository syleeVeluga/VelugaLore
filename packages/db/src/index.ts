import { packageBoundarySchema, type PackageBoundary } from "@weki/core";

export const dbPackage: PackageBoundary = packageBoundarySchema.parse({
  name: "@weki/db",
  responsibility: "drizzle schema, migrations, query helpers"
});
