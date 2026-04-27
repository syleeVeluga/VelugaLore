import { describe, expect, it } from "vitest";
import {
  applyCurateRun,
  revertCurateRun,
  sha256Hex,
  verifyBacklinkTargets,
  type IaWorkspaceState
} from "./ia-ops.js";

function doc(input: Partial<IaWorkspaceState["documents"][number]> & { id: string; path: string; title: string; body: string }) {
  return {
    kind: "concept" as const,
    rev: 1,
    bodySha256: sha256Hex(input.body),
    lastEditor: "human" as const,
    ...input
  };
}

describe("S-09b IA op application", () => {
  it("preserves backlinks, creates stubs, snapshots versions, and reverts one run exactly", () => {
    const before: IaWorkspaceState = {
      documents: [
        doc({ id: "index", path: "wiki/policies/_index.md", title: "Policies", kind: "index", body: "# Policies" }),
        doc({ id: "policy", path: "wiki/policies/security.md", title: "Security", body: "# Security" }),
        doc({ id: "ref", path: "wiki/policies/ref.md", title: "Reference", body: "See [[Security]]." })
      ],
      links: [{ srcDocId: "ref", dstDocId: "policy", kind: "wikilink", occurrences: 1 }],
      versions: [],
      auditLog: []
    };

    const { state: applied, journal } = applyCurateRun(before, {
      runId: "run-curate-1",
      ops: [
        {
          kind: "move_doc",
          docId: "policy",
          newPath: "wiki/concepts/security.md",
          relink: true,
          leaveStub: true,
          evidence: { source: "frontmatter.kind", note: "path mismatch" }
        },
        {
          kind: "adopt_orphan",
          docId: "policy",
          parentIndexDocId: "index",
          section: "Security",
          evidence: { source: "list_links_to", note: "index adoption" }
        }
      ]
    });

    expect(verifyBacklinkTargets(applied).ok).toBe(true);
    expect(applied.documents.find((item) => item.id === "policy")?.path).toBe("wiki/concepts/security.md");
    expect(applied.documents.some((item) => item.kind === "stub" && item.path === "wiki/policies/security.md")).toBe(true);
    expect(applied.documents.find((item) => item.id === "ref")?.body).toContain("[[Security]]");
    expect(applied.documents.find((item) => item.id === "index")?.body).toContain("[[Security]]");
    expect(applied.versions.some((version) => version.docId === "policy" && version.rev === 1)).toBe(true);
    expect(applied.auditLog.some((event) => event.action === "curate.apply")).toBe(true);

    const reverted = revertCurateRun(applied, journal);
    expect(reverted.documents.slice(0, before.documents.length)).toEqual(before.documents);
    expect(reverted.links).toEqual(before.links);
    expect(reverted.auditLog.some((event) => event.action === "curate.revert")).toBe(true);
  });

  it("merges duplicate documents with stubs and no dangling link targets", () => {
    const before: IaWorkspaceState = {
      documents: [
        doc({ id: "a", path: "wiki/policies/a.md", title: "A", body: "# A\n\nSame policy." }),
        doc({ id: "b", path: "wiki/policies/b.md", title: "B", body: "# B\n\nSame policy." }),
        doc({ id: "ref", path: "wiki/policies/ref.md", title: "Reference", body: "See [[B]]." })
      ],
      links: [{ srcDocId: "ref", dstDocId: "b", kind: "wikilink", occurrences: 1 }],
      versions: [],
      auditLog: []
    };

    const { state } = applyCurateRun(before, {
      runId: "run-curate-2",
      ops: [
        {
          kind: "merge_docs",
          docIds: ["a", "b"],
          intoPath: "wiki/policies/a.md",
          intoTitle: "A",
          redirectStrategy: "stub",
          preserveHistory: true,
          evidence: { source: "find_duplicates", note: "near duplicate" }
        }
      ]
    });

    expect(state.documents.some((item) => item.id === "b")).toBe(false);
    expect(state.documents.some((item) => item.kind === "stub" && item.path === "wiki/policies/b.md")).toBe(true);
    expect(verifyBacklinkTargets(state)).toMatchObject({ ok: true, missing: [] });
  });

  it("does not duplicate prior audit events when reverting a run", () => {
    const before: IaWorkspaceState = {
      documents: [doc({ id: "policy", path: "wiki/policies/security.md", title: "Security", body: "# Security" })],
      links: [],
      versions: [],
      auditLog: [{ action: "manual.seed", targetKind: "doc", targetId: "policy", payload: { reason: "test" } }]
    };

    const { state: applied, journal } = applyCurateRun(before, {
      runId: "run-curate-3",
      ops: [
        {
          kind: "move_doc",
          docId: "policy",
          newPath: "wiki/concepts/security.md",
          relink: true,
          leaveStub: true,
          evidence: { source: "frontmatter.kind", note: "path mismatch" }
        }
      ]
    });
    const reverted = revertCurateRun(applied, journal);

    expect(reverted.auditLog.filter((event) => event.action === "manual.seed")).toHaveLength(1);
    expect(reverted.auditLog.map((event) => event.action)).toEqual(["manual.seed", "curate.apply", "curate.revert"]);
  });
});
