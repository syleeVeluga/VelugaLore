import { describe, expect, it } from "vitest";
import { applyPatchOpsToBody, renderPatchPreview } from "./patch.js";

describe("S-07 patch preview", () => {
  it("renders before and after text for a draft patch", () => {
    const preview = renderPatchPreview({
      document: { id: "doc-1", body: "" },
      ops: [
        {
          kind: "insert_section_tree",
          docId: "doc-1",
          position: "document_start",
          sections: [{ heading: "Context", level: 2 }]
        },
        {
          kind: "append_paragraph",
          docId: "doc-1",
          sectionHeading: "Context",
          text: "A concise starting point."
        }
      ]
    });

    expect(preview.beforeText).toBe("");
    expect(preview.afterText).toContain("## Context");
    expect(preview.afterText).toContain("A concise starting point.");
    expect(preview.rows).toHaveLength(2);
    expect(preview.previewHtml).toContain("Before");
    expect(preview.previewHtml).toContain("After");
  });

  it("keeps draft patch application idempotent for A1", () => {
    const body = "Intro\nShort note.\nEnd";
    const ops = [
      {
        kind: "replace_range" as const,
        docId: "doc-1",
        from: 6,
        to: 17,
        text: "Short note with clearer context."
      }
    ];

    const once = applyPatchOpsToBody(body, ops, "doc-1");
    const twice = applyPatchOpsToBody(once, ops, "doc-1");

    expect(once).toBe(twice);
  });

  it("does not skip replacements that shorten a prefixed range", () => {
    const once = applyPatchOpsToBody(
      "abcdef",
      [{ kind: "replace_range", docId: "doc-1", from: 0, to: 6, text: "abc" }],
      "doc-1"
    );

    expect(once).toBe("abc");
  });

  it("rejects replace_range ops whose indices exceed body length", () => {
    expect(() =>
      applyPatchOpsToBody(
        "abc",
        [{ kind: "replace_range", docId: "doc-1", from: 0, to: 99, text: "x" }],
        "doc-1"
      )
    ).toThrow(/out of bounds/);

    expect(() =>
      applyPatchOpsToBody(
        "abc",
        [{ kind: "replace_range", docId: "doc-1", from: 99, to: 100, text: "x" }],
        "doc-1"
      )
    ).toThrow(/out of bounds/);
  });

  it("escapes document text in preview html", () => {
    const preview = renderPatchPreview({
      document: { id: "doc-1", body: "<script>alert(1)</script>" },
      ops: [{ kind: "append_paragraph", docId: "doc-1", text: "safe" }]
    });

    expect(preview.previewHtml).toContain("&lt;script&gt;");
    expect(preview.previewHtml).not.toContain("<script>");
  });
});
