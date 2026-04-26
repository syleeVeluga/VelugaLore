import pg from "pg";
import { migrations, migrationsTableName } from "./migrations.js";

const { Client } = pg;

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required for database commands");
  }
  return url;
}

async function withClient<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function migrate(): Promise<void> {
  await withClient(async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${migrationsTableName} (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    for (const migration of migrations) {
      const existing = await client.query("SELECT 1 FROM weki_schema_migrations WHERE id = $1", [migration.id]);
      if (existing.rowCount && existing.rowCount > 0) {
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(await migration.readSql());
        await client.query("INSERT INTO weki_schema_migrations (id) VALUES ($1)", [migration.id]);
        await client.query("COMMIT");
        console.log(`applied ${migration.id}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  });
}

export async function reset(): Promise<void> {
  await withClient(async (client) => {
    await client.query(`
      DROP SCHEMA public CASCADE;
      CREATE SCHEMA public;
      GRANT ALL ON SCHEMA public TO public;
    `);
  });
  await migrate();
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "migrate") {
    await migrate();
    return;
  }
  if (command === "reset") {
    await reset();
    return;
  }
  throw new Error(`Unknown db command: ${command ?? "(none)"}`);
}

if (process.argv[1]?.endsWith("commands.ts") || process.argv[1]?.endsWith("commands.js")) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
