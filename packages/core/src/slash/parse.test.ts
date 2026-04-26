import { describe, expect, it } from "vitest";
import { parseSlash, SlashParseError } from "./parse.js";

const ctx = {
  docId: "doc-1",
  selection: { docId: "doc-1", from: 10, to: 42, text: "selected text" }
};

describe("parseSlash", () => {
  it("parses /draft and represents the current selection target", () => {
    const invocation = parseSlash("/draft summarize this for onboarding --audience executives", ctx);

    expect(invocation).toMatchObject({
      verb: "draft",
      target: { kind: "selection", docId: "doc-1", from: 10, to: 42 },
      args: { audience: "executives" },
      freeText: "summarize this for onboarding"
    });
  });

  it("parses keyed path targets and boolean flags", () => {
    const invocation = parseSlash(
      "/import path:./onboarding.zip --target wiki/policies --preserve-tree --remap-links",
      { docId: "doc-1" }
    );

    expect(invocation.target).toEqual({ kind: "path", path: "./onboarding.zip" });
    expect(invocation.args).toEqual({
      path: "./onboarding.zip",
      target: "wiki/policies",
      "preserve-tree": true,
      "remap-links": true
    });
  });

  it("keeps quoted text together and coerces numeric args", () => {
    const invocation = parseSlash('/find "exact phrase" --topk 10 --mode literal', { docId: "doc-1" });

    expect(invocation.target).toEqual({ kind: "query", query: "exact phrase" });
    expect(invocation.args).toEqual({ topk: 10, mode: "literal" });
    expect(invocation.freeText).toBe("exact phrase");
  });

  it("does not default a selection target for commands that reject selection", () => {
    const invocation = parseSlash("/ask summarize the onboarding pages", ctx);

    expect(invocation.target).toEqual({ kind: "query", query: "summarize the onboarding pages" });
  });

  it("preserves repeated args and doc targets", () => {
    const diff = parseSlash("/diff doc:policy --rev 12 --rev 17", { docId: "doc-1" });
    const compare = parseSlash("/compare doc:policy-2025 doc:policy-2026", { docId: "doc-1" });

    expect(diff.args).toEqual({ doc: "policy", rev: [12, 17] });
    expect(compare.target).toEqual({ kind: "docs", docIds: ["policy-2025", "policy-2026"] });
    expect(compare.args).toEqual({ doc: ["policy-2025", "policy-2026"] });
  });

  it("parses range targets against the current document", () => {
    const invocation = parseSlash("/blame range:42:118", { docId: "doc-1" });

    expect(invocation.target).toEqual({ kind: "selection", docId: "doc-1", from: 42, to: 118 });
    expect(invocation.args).toEqual({ range: "42:118" });
  });

  it("throws a structured parse error for malformed commands", () => {
    expect(() => parseSlash("draft", { docId: "doc-1" })).toThrow(SlashParseError);
    expect(() => parseSlash('/draft "unterminated', { docId: "doc-1" })).toThrow(SlashParseError);
  });
});
