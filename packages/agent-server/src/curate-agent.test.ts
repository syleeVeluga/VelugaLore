import { describe, expect, it } from "vitest";
import { createAgentDaemon } from "./daemon.js";
import { runCurateAgent } from "./curate-agent.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";

describe("S-09b CurateAgent", () => {
  it("proposes only IA ops and never bypasses approval", () => {
    const patch = runCurateAgent({
      workspaceId,
      agentId: "curate",
      input: "/curate scope:wiki/policies",
      context: {
        documents: [
          {
            docId: "index",
            title: "Policies",
            path: "wiki/policies/_index.md",
            body: "# Policies"
          },
          {
            docId: "duplicate-a",
            title: "Onboarding Policy",
            path: "wiki/policies/onboarding.md",
            body: "kind: concept\n\n# Onboarding Policy\n\nAccess approval manager review security checklist."
          },
          {
            docId: "duplicate-b",
            title: "Onboarding Checklist",
            path: "wiki/policies/onboarding-checklist.md",
            body: "kind: concept\n\n# Onboarding Checklist\n\nAccess approval manager review security checklist."
          },
          {
            docId: "misfiled",
            title: "Security Concept",
            path: "wiki/policies/security.md",
            body: "kind: concept\n\n# Security Concept\n\n[[Policies]]"
          },
          {
            docId: "orphan",
            title: "Unlinked Note",
            path: "wiki/policies/unlinked.md",
            body: "# Unlinked Note\n\nNo links yet."
          }
        ]
      }
    });

    expect(patch.outputSchema).toBe("CuratePatch");
    expect(patch.requiresApproval).toBe(true);
    expect(patch.ops.every((op) => ["split_doc", "merge_docs", "move_doc", "adopt_orphan"].includes(op.kind))).toBe(true);
    expect(patch.ops.some((op) => op.kind === "merge_docs")).toBe(true);
    expect(patch.ops.some((op) => op.kind === "move_doc")).toBe(true);
    expect(patch.ops.some((op) => op.kind === "adopt_orphan")).toBe(true);
    expect(patch.previewHtml).toContain("weki-curate-preview");
  });

  it("stores /curate output in the approval queue instead of applying it", async () => {
    const daemon = createAgentDaemon();
    const run = await daemon.runAgent({
      workspaceId,
      agentId: "curate",
      input: "/curate scope:wiki/policies",
      context: {
        documents: [
          { docId: "index", title: "Policies", path: "wiki/policies/_index.md", body: "# Policies" },
          { docId: "orphan", title: "Orphan", path: "wiki/policies/orphan.md", body: "# Orphan" }
        ]
      }
    });

    const pending = await daemon.approvalStore.list({ status: "proposed", workspaceId });

    expect(run.status).toBe("succeeded");
    expect(pending).toHaveLength(1);
    expect(pending[0]?.agentRunId).toBe(run.id);
    expect(pending[0]?.status).toBe("proposed");
  });

  it("preserves supplied document kind when frontmatter is absent", () => {
    const patch = runCurateAgent({
      workspaceId,
      agentId: "curate",
      input: "/curate scope:wiki/policies",
      context: {
        documents: [
          {
            docId: "misfiled",
            title: "Security",
            path: "wiki/policies/security.md",
            body: "# Security\n\n[[Policies]]",
            kind: "concept"
          }
        ]
      }
    });

    expect(patch.ops).toContainEqual(expect.objectContaining({
      kind: "move_doc",
      docId: "misfiled",
      newPath: "wiki/concepts/security.md"
    }));
  });
});
