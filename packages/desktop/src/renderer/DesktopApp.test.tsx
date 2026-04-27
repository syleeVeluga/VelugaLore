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
    expect(html).toContain("Browse");
    expect(html).toContain("Analyze");
    expect(html).toContain("New Folder");
    expect(html).toContain("Duplicate");
  });
});

describe("S-09b manual file ops UI", () => {
  it("exposes Rename and Move to buttons in the file actions bar", () => {
    const html = renderToString(<DesktopApp api={fakeApi} />);
    expect(html).toContain("Rename");
    expect(html).toContain("Move to");
  });

  it("renders the drop hint so users discover drag-to-move", () => {
    const html = renderToString(<DesktopApp api={fakeApi} />);
    expect(html).toContain("Drop on a file");
  });

  it("localizes the manual file ops in Korean", () => {
    const html = renderToString(<DesktopApp api={fakeApi} locale="ko" />);
    expect(html).toContain("이름 변경");
    expect(html).toContain("이동");
    expect(html).toContain("다른 파일 위에 놓아");
  });
});

const fakeApi: DesktopApi = {
  async pickWorkspaceDirectory() {
    return undefined;
  },
  async openWorkspace() {
    return {
      workspaceId: "00000000-0000-4000-8000-000000000000",
      root: "D:/tmp/weki",
      agentServerPort: 0,
      defaultMode: "analyze",
      userId: "00000000-0000-4000-8000-000000000001",
      displayName: "Solo",
      mode: "solo"
    };
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
  async createFolder() {
    return {
      id: "folder-1",
      path: "wiki/_index.md",
      body: "# Wiki\n",
      bodySha256: "",
      rev: 1,
      lastEditor: "human",
      kind: "index"
    };
  },
  async renameDoc() {
    return {
      id: "doc-1",
      path: "Renamed.md",
      body: "",
      bodySha256: "",
      rev: 2,
      lastEditor: "human"
    };
  },
  async moveDoc() {
    return {
      id: "doc-1",
      path: "wiki/Untitled.md",
      body: "",
      bodySha256: "",
      rev: 2,
      lastEditor: "human"
    };
  },
  async duplicateDoc() {
    return {
      id: "doc-copy",
      path: "Untitled-copy.md",
      body: "",
      bodySha256: "",
      rev: 1,
      lastEditor: "human"
    };
  },
  async archiveDoc() {
    return {
      id: "doc-1",
      path: "wiki/_archive/Untitled.md",
      body: "",
      bodySha256: "",
      rev: 2,
      lastEditor: "human"
    };
  },
  async restoreDoc() {
    return {
      id: "doc-1",
      path: "Untitled.md",
      body: "",
      bodySha256: "",
      rev: 3,
      lastEditor: "human"
    };
  },
  async updateDocMetadata() {
    return {
      id: "doc-1",
      path: "Untitled.md",
      body: "",
      bodySha256: "",
      rev: 2,
      lastEditor: "human",
      tags: ["manual"]
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
