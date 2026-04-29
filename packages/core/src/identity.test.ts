import { describe, expect, it } from "vitest";
import {
  localUserIdentitySchema,
  localUserIdentityToFileJson,
  parseDevActAsRole,
  resolveDevActAsRole
} from "./identity.js";

describe("S-12a Solo identity helpers", () => {
  it("accepts only supported dev act-as roles", () => {
    expect(parseDevActAsRole("reader")).toBe("reader");
    expect(parseDevActAsRole("editor")).toBe("editor");
    expect(parseDevActAsRole("admin")).toBe("admin");
    expect(parseDevActAsRole("owner")).toBe("owner");
    expect(parseDevActAsRole("superuser")).toBeUndefined();
  });

  it("strips dev act-as role in production", () => {
    expect(resolveDevActAsRole({ value: "owner", isProduction: false })).toBe("owner");
    expect(resolveDevActAsRole({ value: "owner", isProduction: true })).toBeUndefined();
  });

  it("reads PRD-shaped Solo user files and legacy camelCase files", () => {
    const userId = "55555555-5555-4555-8555-555555555555";
    expect(
      localUserIdentitySchema.parse({
        version: 1,
        user_id: userId,
        display_name: "Solo Dev",
        provisioned_at: "2026-04-28T00:00:00.000Z"
      })
    ).toEqual({
      version: 1,
      userId,
      displayName: "Solo Dev",
      provisionedAt: "2026-04-28T00:00:00.000Z"
    });
    expect(
      localUserIdentitySchema.parse({
        version: 1,
        userId,
        displayName: "Legacy Solo",
        provisionedAt: "2026-04-28T00:00:00.000Z"
      }).displayName
    ).toBe("Legacy Solo");
  });

  it("writes local Solo identity using the PRD user.json shape", () => {
    expect(
      localUserIdentityToFileJson({
        version: 1,
        userId: "55555555-5555-4555-8555-555555555555",
        displayName: "Solo Dev",
        provisionedAt: "2026-04-28T00:00:00.000Z"
      })
    ).toEqual({
      version: 1,
      user_id: "55555555-5555-4555-8555-555555555555",
      display_name: "Solo Dev",
      provisioned_at: "2026-04-28T00:00:00.000Z"
    });
  });
});
