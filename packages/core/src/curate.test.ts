import { describe, expect, it } from "vitest";
import { curatePatchSchema } from "./agent.js";

describe("S-09b CuratePatch contract", () => {
  it("accepts IA-only operations that are always approval gated", () => {
    const patch = curatePatchSchema.parse({
      kind: "Patch",
      outputSchema: "CuratePatch",
      agentId: "curate",
      requiresApproval: true,
      rationale: "IA-only proposal.",
      rationalePerOp: ["move keeps backlinks through relink and stub redirect."],
      ops: [
        {
          kind: "move_doc",
          docId: "doc-policy",
          newPath: "wiki/concepts/policy.md",
          relink: true,
          leaveStub: true,
          evidence: {
            source: "frontmatter.kind",
            score: 1,
            note: "kind/path mismatch"
          }
        }
      ]
    });

    expect(patch.requiresApproval).toBe(true);
    expect(patch.ops.map((op) => op.kind)).toEqual(["move_doc"]);
  });

  it("rejects prose-edit operations and approval bypasses", () => {
    expect(() =>
      curatePatchSchema.parse({
        kind: "Patch",
        outputSchema: "CuratePatch",
        agentId: "curate",
        requiresApproval: true,
        rationale: "Invalid prose edit.",
        rationalePerOp: ["replace_range is not an IA operation."],
        ops: [{ kind: "replace_range", docId: "doc-1", from: 0, to: 1, text: "x" }]
      })
    ).toThrow();

    expect(() =>
      curatePatchSchema.parse({
        kind: "Patch",
        outputSchema: "CuratePatch",
        agentId: "curate",
        requiresApproval: false,
        rationale: "Invalid bypass.",
        rationalePerOp: ["move_doc must still require approval."],
        ops: [
          {
            kind: "move_doc",
            docId: "doc-policy",
            newPath: "wiki/concepts/policy.md",
            evidence: { source: "test", note: "bypass" }
          }
        ]
      })
    ).toThrow();
  });
});
