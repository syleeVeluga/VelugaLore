import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const migrationsTableName = "weki_schema_migrations";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export type Migration = {
  id: string;
  path: string;
  readSql: () => Promise<string>;
};

export const migrations: Migration[] = [
  {
    id: "0001_initial_schema",
    path: path.join(packageRoot, "migrations", "0001_initial_schema.sql"),
    readSql: () => readFile(path.join(packageRoot, "migrations", "0001_initial_schema.sql"), "utf8")
  }
];
