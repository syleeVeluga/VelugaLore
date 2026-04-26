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

  it("throws a structured parse error for malformed commands", () => {
    expect(() => parseSlash("draft", { docId: "doc-1" })).toThrow(SlashParseError);
    expect(() => parseSlash('/draft "unterminated', { docId: "doc-1" })).toThrow(SlashParseError);
  });
});
