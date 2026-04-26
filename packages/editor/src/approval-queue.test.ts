import { describe, expect, it } from "vitest";
import { renderPatchPreview } from "@weki/core";
import { approvalDecisionFromKeyboard, renderApprovalQueuePreview } from "./approval-queue.js";

describe("S-07 approval queue editor model", () => {
  it("maps keyboard shortcuts to apply and reject decisions", () => {
    expect(approvalDecisionFromKeyboard({ key: "Enter", ctrlKey: true })).toBe("applied");
    expect(approvalDecisionFromKeyboard({ key: "Enter", metaKey: true })).toBe("applied");
    expect(approvalDecisionFromKeyboard({ key: "Escape" })).toBe("rejected");
    expect(approvalDecisionFromKeyboard({ key: "r" })).toBe("rejected");
    expect(approvalDecisionFromKeyboard({ key: "ArrowDown" })).toBeUndefined();
  });

  it("keeps preview labels i18n-key ready and exposes before/after rows", () => {
    const preview = renderPatchPreview({
      document: { id: "doc-1", body: "Old" },
      ops: [{ kind: "replace_range", docId: "doc-1", from: 0, to: 3, text: "New" }]
    });

    const view = renderApprovalQueuePreview(preview);

    expect(view.title).toBe("patch.preview.title");
    expect(view.beforeLabel).toBe("patch.preview.before");
    expect(view.afterLabel).toBe("patch.preview.after");
    expect(view.rows[0]).toMatchObject({ before: "Old", after: "New" });
  });
});
