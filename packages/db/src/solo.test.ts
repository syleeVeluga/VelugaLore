import { describe, expect, it } from "vitest";
import { ensureSoloWorkspaceIdentity } from "./solo.js";

describe("S-12a Solo workspace identity bootstrap", () => {
  it("creates a stable Solo user membership as editor without schema changes", async () => {
    const queries: { sql: string; values?: unknown[] }[] = [];
    const identity = await ensureSoloWorkspaceIdentity(
      {
        async query<Row>(sql: string, values?: unknown[]) {
          queries.push({ sql, values });
          return {
            rows: [
              {
                workspace_id: "11111111-1111-4111-8111-111111111111",
                org_id: "22222222-2222-4222-8222-222222222222",
                user_id: "55555555-5555-4555-8555-555555555555",
                role: "editor"
              }
            ] as Row[]
          };
        }
      },
      {
        workspaceId: "11111111-1111-4111-8111-111111111111",
        userId: "55555555-5555-4555-8555-555555555555",
        displayName: "Solo Dev",
        workspaceName: "Solo Workspace",
        fsRoot: "C:/tmp/solo"
      }
    );

    expect(identity).toEqual({
      workspaceId: "11111111-1111-4111-8111-111111111111",
      orgId: "22222222-2222-4222-8222-222222222222",
      userId: "55555555-5555-4555-8555-555555555555",
      role: "editor"
    });
    expect(queries).toHaveLength(1);
    expect(queries[0]?.sql).toContain("INSERT INTO memberships");
    expect(queries[0]?.sql).toContain("DO UPDATE SET role = 'editor'");
    expect(queries[0]?.values).toEqual([
      "solo-11111111-1111-4111-8111-111111111111",
      "Solo Workspace",
      "55555555-5555-4555-8555-555555555555",
      "55555555-5555-4555-8555-555555555555@solo.local.weki.invalid",
      "Solo Dev",
      "11111111-1111-4111-8111-111111111111",
      "C:/tmp/solo"
    ]);
  });
});
