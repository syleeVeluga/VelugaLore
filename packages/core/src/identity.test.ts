import { describe, expect, it } from "vitest";
import { parseDevActAsRole, resolveDevActAsRole } from "./identity.js";

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
});
