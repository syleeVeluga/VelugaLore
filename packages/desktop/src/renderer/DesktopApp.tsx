import { renderSlashMenuItems } from "@weki/editor";
import { useMemo, useState } from "react";
import type { ApplyPatchResponse, PendingApproval } from "../desktop-session.js";
import type { WorkspaceDocumentRecord } from "../workspace-sync.js";
import type { DesktopApi } from "./desktop-api.js";
import { createDesktopTranslator, type DesktopLocale } from "./messages.js";
import "./styles.css";

type DesktopAppProps = {
  api: DesktopApi;
  locale?: DesktopLocale;
};

const defaultWorkspacePath = "";

export function DesktopApp({ api, locale = "en" }: DesktopAppProps) {
  const t = useMemo(() => createDesktopTranslator(locale), [locale]);
  const [workspacePath, setWorkspacePath] = useState(defaultWorkspacePath);
  const [workspaceRoot, setWorkspaceRoot] = useState<string>();
  const [documents, setDocuments] = useState<WorkspaceDocumentRecord[]>([]);
  const [activeDoc, setActiveDoc] = useState<WorkspaceDocumentRecord>();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState<PendingApproval[]>([]);
  const [activeRunId, setActiveRunId] = useState<string>();
  const [status, setStatus] = useState(t("desktop.status.ready"));
  const [mode, setMode] = useState<"analyze" | "edit">("edit");

  const slashItems = useMemo(() => {
    const line = body.split(/\r?\n/).at(-1) ?? "";
    const match = /(?:^|\s)(\/[A-Za-z0-9_-]*)$/.exec(line);
    return match ? renderSlashMenuItems(match[1], t) : [];
  }, [body, t]);

  async function refreshDocuments(nextActiveId?: string) {
    const nextDocuments = await api.listDocuments();
    setDocuments(nextDocuments);
    const selected = nextDocuments.find((doc) => doc.id === nextActiveId) ?? nextDocuments[0];
    if (selected) {
      const read = await api.readDoc(selected.id);
      setActiveDoc({ ...selected, body: read.body, bodySha256: read.bodySha256, rev: read.rev });
      setBody(read.body);
    }
  }

  async function openWorkspace() {
    const opened = await api.openWorkspace(workspacePath);
    setWorkspaceRoot(opened.root);
    setStatus(t("desktop.status.opened"));
    await refreshDocuments();
  }

  async function createNote() {
    const base = documents.length === 0 ? "Untitled.md" : `Untitled-${documents.length + 1}.md`;
    const created = await api.createDoc(base);
    setStatus(t("desktop.status.created"));
    await refreshDocuments(created.id);
  }

  async function openDoc(docId: string) {
    const doc = documents.find((item) => item.id === docId);
    if (!doc) {
      return;
    }
    const read = await api.readDoc(docId);
    setActiveDoc({ ...doc, body: read.body, bodySha256: read.bodySha256, rev: read.rev });
    setBody(read.body);
  }

  async function runDraft() {
    if (!activeDoc) {
      return;
    }
    setStatus(t("desktop.agent.running"));
    const command = lastDraftLine(body) ?? "/draft";
    const run = await api.runDraft({ docId: activeDoc.id, prompt: command, body: activeDoc.body, path: activeDoc.path });
    setActiveRunId(run.id);
    const approvals = await api.listPendingApprovals();
    setPending(approvals);
    setStatus(t("desktop.agent.pending"));
  }

  async function decide(decision: "approve" | "reject") {
    if (!activeRunId) {
      return;
    }
    const result = await api.applyPatch(activeRunId, decision);
    setStatus(statusForPatchResult(result, t));
    setPending(await api.listPendingApprovals());
    if (result.status === "applied") {
      await refreshDocuments(result.document.id);
    }
  }

  return (
    <main className="desktop-shell">
      <header className="titlebar">
        <div className="brand">{t("desktop.app.title")}</div>
        <label className="workspace-picker">
          <span>{t("desktop.workspace.path")}</span>
          <input value={workspacePath} onChange={(event) => setWorkspacePath(event.target.value)} />
        </label>
        <button type="button" onClick={openWorkspace}>
          {t("desktop.workspace.open")}
        </button>
        <button
          type="button"
          className={`mode-chip ${mode}`}
          onClick={() => setMode(mode === "analyze" ? "edit" : "analyze")}
        >
          {mode === "analyze" ? t("desktop.mode.analyze") : t("desktop.mode.edit")}
        </button>
      </header>

      <section className="workspace-grid">
        <aside className="left-pane">
          <div className="pane-heading">
            <span>{t("desktop.files.title")}</span>
            <button type="button" onClick={createNote} disabled={!workspaceRoot}>
              {t("desktop.files.new")}
            </button>
          </div>
          {documents.length === 0 ? (
            <div className="empty-state">{workspaceRoot ? t("desktop.files.empty") : t("desktop.workspace.empty")}</div>
          ) : (
            <ol className="file-list">
              {documents.map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    className={doc.id === activeDoc?.id ? "selected" : undefined}
                    onClick={() => void openDoc(doc.id)}
                  >
                    {doc.path}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </aside>

        <section className="editor-pane">
          {activeDoc ? (
            <>
              <div className="doc-bar">
                <span>{activeDoc.path}</span>
                <span>
                  {t("desktop.editor.rev")} {activeDoc.rev}
                </span>
              </div>
              <div className="editor-wrap">
                <textarea value={body} onChange={(event) => setBody(event.target.value)} spellCheck={false} />
                {slashItems.length > 0 ? (
                  <div className="slash-menu">
                    {slashItems.slice(0, 5).map((item) => (
                      <button key={item.label} type="button" onClick={() => setBody(replaceLastSlashToken(body, item.label))}>
                        <strong>{item.label}</strong>
                        <span>{item.detail}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="empty-editor">{t("desktop.editor.empty")}</div>
          )}
        </section>

        <aside className="right-pane">
          <div className="pane-heading">
            <span>{t("desktop.agent.title")}</span>
            <span className="status">{status}</span>
          </div>
          <button type="button" onClick={runDraft} disabled={!activeDoc || mode === "analyze"}>
            {t("desktop.agent.runDraft")}
          </button>
          <div className="pending-list">
            <div className="section-label">{t("desktop.agent.pending")}</div>
            {pending.map((item) => (
              <article key={item.id} className="pending-item">
                <div>{item.agentRunId.slice(0, 8)}</div>
                {item.previewHtml ? (
                  <div className="preview" dangerouslySetInnerHTML={{ __html: item.previewHtml }} />
                ) : (
                  <div>{t("desktop.agent.preview")}</div>
                )}
              </article>
            ))}
          </div>
          <div className="decision-row">
            <button type="button" onClick={() => void decide("approve")} disabled={!activeRunId || mode === "analyze"}>
              {t("desktop.agent.approve")}
            </button>
            <button type="button" onClick={() => void decide("reject")} disabled={!activeRunId}>
              {t("desktop.agent.reject")}
            </button>
          </div>
        </aside>
      </section>
    </main>
  );
}

function lastDraftLine(body: string): string | undefined {
  return body
    .split(/\r?\n/)
    .reverse()
    .find((line) => line.trim().startsWith("/draft"))
    ?.trim();
}

function replaceLastSlashToken(body: string, replacement: string): string {
  return body.replace(/(?:^|\s)\/[A-Za-z0-9_-]*$/, (token) => `${token.startsWith(" ") ? " " : ""}${replacement}`);
}

function statusForPatchResult(result: ApplyPatchResponse, t: ReturnType<typeof createDesktopTranslator>): string {
  switch (result.status) {
    case "applied":
      return t("desktop.agent.applied");
    case "rejected":
      return t("desktop.agent.rejected");
    default:
      return t("desktop.status.error");
  }
}
