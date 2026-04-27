import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { createMarkdownDiagnosticIndex } from "./index.js";

describe("markdown diagnostics", () => {
  it("reports broken wiki links with source ranges", () => {
    const index = createMarkdownDiagnosticIndex([
      { id: "a", path: "wiki/a.md", body: "# A\n\nSee [[Missing Page]] and [[wiki/b]]." },
      { id: "b", path: "wiki/b.md", body: "# B\n" }
    ]);

    const diagnostics = index.diagnoseDocument("a");

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "broken-link",
        severity: "warning",
        target: "Missing Page",
        range: expect.objectContaining({ from: expect.any(Number), to: expect.any(Number) })
      })
    );
    expect(diagnostics.some((diagnostic) => diagnostic.target === "wiki/b")).toBe(false);
  });

  it("detects orphan documents without incoming links", () => {
    const index = createMarkdownDiagnosticIndex([
      { id: "source", path: "wiki/source.md", body: "# Source\n\n[[Target]]" },
      { id: "target", path: "wiki/target.md", title: "Target", body: "# Target\n" }
    ]);

    expect(index.diagnoseDocument("target").map((diagnostic) => diagnostic.code)).not.toContain("orphan-node");
    expect(index.diagnoseDocument("source").map((diagnostic) => diagnostic.code)).toContain("orphan-node");
  });

  it("keeps changed-document diagnostics responsive for a 10k-node workspace", () => {
    const documents = Array.from({ length: 10_000 }, (_, index) => ({
      id: `doc-${index}`,
      path: `wiki/doc-${index}.md`,
      title: `Doc ${index}`,
      body: index === 0 ? "# Doc 0\n\n[[Doc 1]]" : `# Doc ${index}\n`
    }));
    const index = createMarkdownDiagnosticIndex(documents);

    const started = performance.now();
    const diagnostics = index.applyChange({
      id: "doc-0",
      path: "wiki/doc-0.md",
      title: "Doc 0",
      body: "# Doc 0\n\n[[Missing Target]]"
    });
    const elapsedMs = performance.now() - started;

    expect(diagnostics).toContainEqual(expect.objectContaining({ code: "broken-link", target: "Missing Target" }));
    expect(elapsedMs).toBeLessThan(200);
  });
});
