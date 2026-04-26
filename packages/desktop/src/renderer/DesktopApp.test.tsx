import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DesktopApi } from "./desktop-api.js";
import { DesktopApp } from "./DesktopApp.js";

describe("S-08.5 renderer shell", () => {
  it("renders the three-pane desktop surface without a browser DOM", () => {
    const html = renderToString(<DesktopApp api={fakeApi} />);

    expect(html).toContain("WekiDocs");
    expect(html).toContain("Files");
    expect(html).toContain("Agent");
    expect(html).toContain("Open Workspace");
  });
});

const fakeApi: DesktopApi = {
  async openWorkspace() {
    return { workspaceId: "00000000-0000-4000-8000-000000000000", root: "D:/tmp/weki", agentServerPort: 0 };
  },
  async listDocuments() {
    return [];
  },
  async createDoc() {
    return {
      id: "doc-1",
      path: "Untitled.md",
      body: "",
      bodySha256: "",
      rev: 1,
      lastEditor: "human"
    };
  },
  async readDoc() {
    return { body: "", rev: 1, bodySha256: "" };
  },
  async runDraft() {
    return { id: "run-1", status: "succeeded" };
  },
  async listPendingApprovals() {
    return [];
  },
  async applyPatch() {
    return {
      status: "applied",
      filePath: "D:/tmp/weki/Untitled.md",
      document: {
        id: "doc-1",
        path: "Untitled.md",
        body: "draft",
        bodySha256: "sha",
        rev: 2,
        lastEditor: "agent"
      }
    };
  }
};
