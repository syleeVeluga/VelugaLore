import type { PatchPreview } from "@weki/core";

export const approvalDecisionValues = ["applied", "rejected"] as const;
export type ApprovalDecision = (typeof approvalDecisionValues)[number];

export interface ApprovalKeyboardEventLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

export interface ApprovalQueuePreviewView {
  title: string;
  beforeLabel: string;
  afterLabel: string;
  rows: Array<{
    opIndex: number;
    opKind: string;
    before: string;
    after: string;
  }>;
}

export function approvalDecisionFromKeyboard(event: ApprovalKeyboardEventLike): ApprovalDecision | undefined {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    return "applied";
  }

  if (event.key === "Escape" || event.key.toLowerCase() === "r") {
    return "rejected";
  }

  return undefined;
}

export function renderApprovalQueuePreview(preview: PatchPreview): ApprovalQueuePreviewView {
  return {
    title: "patch.preview.title",
    beforeLabel: "patch.preview.before",
    afterLabel: "patch.preview.after",
    rows: preview.rows.map((row) => ({
      opIndex: row.opIndex,
      opKind: row.opKind,
      before: row.before,
      after: row.after
    }))
  };
}
