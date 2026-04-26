import { describe, expect, it } from "vitest";
import { draftPatchSchema } from "./agent.js";

describe("DraftPatch schema", () => {
  it("accepts the S-06 draft op set", () => {
    const parsed = draftPatchSchema.parse({
      kind: "Patch",
      outputSchema: "DraftPatch",
      agentId: "draft",
      requiresApproval: true,
      rationale: "Created a starter outline and prose from the prompt.",
      assumptions: ["Audience defaults to a general reader."],
      ops: [
        {
          kind: "insert_section_tree",
          docId: "doc-1",
          position: "document_start",
          sections: [
            { heading: "Context", level: 2 },
            { heading: "Next Steps", level: 2 }
          ]
        },
        {
          kind: "append_paragraph",
          docId: "doc-1",
          sectionHeading: "Context",
          text: "This draft frames the topic and gives the user a concrete starting point."
        }
      ]
    });

    expect(parsed.ops.map((op) => op.kind)).toEqual(["insert_section_tree", "append_paragraph"]);
  });

  it("rejects inverted selection ranges", () => {
    expect(() =>
      draftPatchSchema.parse({
        kind: "Patch",
        rationale: "Expanded the selection.",
        ops: [{ kind: "replace_range", docId: "doc-1", from: 9, to: 3, text: "expanded text" }]
      })
    ).toThrow("replace_range.from must be less than or equal to replace_range.to");
  });
});
