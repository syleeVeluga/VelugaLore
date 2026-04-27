import { renderSlashMenuItems } from "@weki/editor";
import { useMemo, useState, type DragEvent } from "react";
import type { ApplyPatchResponse, PendingApproval } from "../desktop-session.js";
import type { WorkspaceDocumentRecord } from "../workspace-sync.js";
import type { DesktopApi } from "./desktop-api.js";
import { createDesktopTranslator, type DesktopLocale } from "./messages.js";
import "./styles.css";

type DesktopAppProps = {
  api: DesktopApi;
  locale?: DesktopLocale;
};

type PendingFileAction =
  | { kind: "rename"; value: string }
  | { kind: "move"; value: string };

const defaultWorkspacePath = "";

function folderOfPath(docPath: string): string {
  const idx = docPath.lastIndexOf("/");
  return idx === -1 ? "." : docPath.slice(0, idx);
}

function defaultRenameValue(doc: WorkspaceDocumentRecord): string {
  if (doc.title) {
    return doc.title;
  }
  const base = doc.path.split("/").pop() ?? doc.path;
  return base.replace(/\.md$/, "");
}

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
  const [mode, setMode] = useState<"analyze" | "edit">("analyze");
  const [commandLine, setCommandLine] = useState("/");
  const [pendingFileAction, setPendingFileAction] = useState<PendingFileAction | null>(null);
  const [draggingDocId, setDraggingDocId] = useState<string | null>(null);

  const slashItems = useMemo(() => {
    const source = mode === "analyze" ? commandLine : body;
    const line = source.split(/\r?\n/).at(-1) ?? "";
    const match = /(?:^|\s)(\/[A-Za-z0-9_-]*)$/.exec(line);
    return match ? renderSlashMenuItems(match[1], t, mode) : [];
  }, [body, commandLine, mode, t]);

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
    let target = workspacePath.trim();
    if (!target) {
      const picked = await api.pickWorkspaceDirectory();
      if (!picked) {
        return;
      }
      target = picked;
      setWorkspacePath(picked);
    }
    try {
      const opened = await api.openWorkspace(target);
      setWorkspaceRoot(opened.root);
      setMode(opened.defaultMode);
      setStatus(t("desktop.status.opened"));
      await refreshDocuments();
    } catch (error) {
      console.error("openWorkspace failed", error);
      setStatus(t("desktop.status.error"));
    }
  }

  async function pickWorkspace() {
    const picked = await api.pickWorkspaceDirectory();
    if (picked) {
      setWorkspacePath(picked);
    }
  }

  async function createNote() {
    const base = documents.length === 0 ? "Untitled.md" : `Untitled-${documents.length + 1}.md`;
    const created = await api.createDoc(base);
    setStatus(t("desktop.status.created"));
    await refreshDocuments(created.id);
  }

  async function createFolder() {
    const base = documents.length === 0 ? "wiki" : `wiki/folder-${documents.length + 1}`;
    const created = await api.createFolder(base);
    setStatus(t("desktop.status.created"));
    await refreshDocuments(created.id);
  }

  async function duplicateActiveDoc() {
    if (!activeDoc) {
      return;
    }
    const duplicated = await api.duplicateDoc(activeDoc.id);
    setStatus(t("desktop.status.created"));
    await refreshDocuments(duplicated.id);
  }

  async function archiveActiveDoc() {
    if (!activeDoc) {
      return;
    }
    const archived = await api.archiveDoc(activeDoc.id);
    setStatus(t("desktop.status.archived"));
    await refreshDocuments(archived.id);
  }

  async function restoreActiveDoc() {
    if (!activeDoc) {
      return;
    }
    const restored = await api.restoreDoc(activeDoc.id);
    setStatus(t("desktop.status.restored"));
    await refreshDocuments(restored.id);
  }

  async function tagActiveDoc() {
    if (!activeDoc) {
      return;
    }
    const updated = await api.updateDocMetadata(activeDoc.id, {
      kind: activeDoc.kind ?? "draft",
      tags: [...new Set([...(activeDoc.tags ?? []), "manual"])]
    });
    setStatus(t("desktop.status.saved"));
    await refreshDocuments(updated.id);
  }

  function beginRenameActiveDoc() {
    if (!activeDoc) {
      return;
    }
    setPendingFileAction({ kind: "rename", value: defaultRenameValue(activeDoc) });
  }

  function beginMoveActiveDoc() {
    if (!activeDoc) {
      return;
    }
    setPendingFileAction({ kind: "move", value: folderOfPath(activeDoc.path) });
  }

  function cancelPendingFileAction() {
    setPendingFileAction(null);
  }

  async function commitPendingFileAction() {
    if (!pendingFileAction || !activeDoc) {
      return;
    }
    if (pendingFileAction.kind === "rename") {
      const trimmed = pendingFileAction.value.trim();
      if (!trimmed) {
        return;
      }
      const renamed = await api.renameDoc(activeDoc.id, trimmed);
      setStatus(t("desktop.status.saved"));
      setPendingFileAction(null);
      await refreshDocuments(renamed.id);
      return;
    }
    const folder = pendingFileAction.value.trim().replace(/^\/+|\/+$/g, "") || ".";
    const moved = await api.moveDoc(activeDoc.id, folder);
    setStatus(t("desktop.status.saved"));
    setPendingFileAction(null);
    await refreshDocuments(moved.id);
  }

  function handleDragStart(docId: string) {
    return (event: DragEvent<HTMLLIElement>) => {
      if (mode === "analyze") {
        event.preventDefault();
        return;
      }
      setDraggingDocId(docId);
      event.dataTransfer.setData("text/plain", docId);
      event.dataTransfer.effectAllowed = "move";
    };
  }

  function handleDragOver(event: DragEvent<HTMLLIElement>) {
    if (mode === "analyze") {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function handleDrop(targetDoc: WorkspaceDocumentRecord) {
    return async (event: DragEvent<HTMLLIElement>) => {
      event.preventDefault();
      const droppedId = event.dataTransfer.getData("text/plain") || draggingDocId;
      setDraggingDocId(null);
      if (!droppedId || droppedId === targetDoc.id || mode === "analyze") {
        return;
      }
      const folder = folderOfPath(targetDoc.path);
      const moved = await api.moveDoc(droppedId, folder === "." ? "." : folder);
      setStatus(t("desktop.status.saved"));
      await refreshDocuments(moved.id);
    };
  }

  function handleDragEnd() {
    setDraggingDocId(null);
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
    if (!activeDoc || mode === "analyze") {
      setStatus(t("desktop.mode.blocked"));
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

  function chooseSlashItem(label: string) {
    if (mode === "analyze") {
      setCommandLine(replaceLastSlashToken(commandLine, label));
      return;
    }
    setBody(replaceLastSlashToken(body, label));
  }

  return (
    <main className="desktop-shell">
      <header className="titlebar">
        <div className="brand">{t("desktop.app.title")}</div>
        <label className="workspace-picker">
          <span>{t("desktop.workspace.path")}</span>
          <input value={workspacePath} onChange={(event) => setWorkspacePath(event.target.value)} />
        </label>
        <button type="button" onClick={pickWorkspace}>
          {t("desktop.workspace.browse")}
        </button>
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
            <button type="button" onClick={createNote} disabled={!workspaceRoot || mode === "analyze"}>
              {t("desktop.files.new")}
            </button>
          </div>
          <div className="file-actions">
            <button type="button" onClick={createFolder} disabled={!workspaceRoot || mode === "analyze"}>
              {t("desktop.files.newFolder")}
            </button>
            <button type="button" onClick={beginRenameActiveDoc} disabled={!activeDoc || mode === "analyze"}>
              {t("desktop.files.rename")}
            </button>
            <button type="button" onClick={beginMoveActiveDoc} disabled={!activeDoc || mode === "analyze"}>
              {t("desktop.files.moveTo")}
            </button>
            <button type="button" onClick={duplicateActiveDoc} disabled={!activeDoc || mode === "analyze"}>
              {t("desktop.files.duplicate")}
            </button>
            <button type="button" onClick={archiveActiveDoc} disabled={!activeDoc || mode === "analyze"}>
              {t("desktop.files.archive")}
            </button>
            <button type="button" onClick={restoreActiveDoc} disabled={!activeDoc || mode === "analyze"}>
              {t("desktop.files.restore")}
            </button>
            <button type="button" onClick={tagActiveDoc} disabled={!activeDoc || mode === "analyze"}>
              {t("desktop.files.tags")}
            </button>
          </div>
          {pendingFileAction ? (
            <form
              className="file-action-form"
              onSubmit={(event) => {
                event.preventDefault();
                void commitPendingFileAction();
              }}
            >
              <input
                aria-label={
                  pendingFileAction.kind === "rename"
                    ? t("desktop.files.renamePlaceholder")
                    : t("desktop.files.movePlaceholder")
                }
                placeholder={
                  pendingFileAction.kind === "rename"
                    ? t("desktop.files.renamePlaceholder")
                    : t("desktop.files.movePlaceholder")
                }
                value={pendingFileAction.value}
                onChange={(event) =>
                  setPendingFileAction(
                    pendingFileAction.kind === "rename"
                      ? { kind: "rename", value: event.target.value }
                      : { kind: "move", value: event.target.value }
                  )
                }
                autoFocus
              />
              <div className="file-action-form-buttons">
                <button type="submit">{t("desktop.files.confirm")}</button>
                <button type="button" onClick={cancelPendingFileAction}>
                  {t("desktop.files.cancel")}
                </button>
              </div>
            </form>
          ) : null}
          <div className="file-drop-hint">{t("desktop.files.dropHint")}</div>
          {documents.length === 0 ? (
            <div className="empty-state">{workspaceRoot ? t("desktop.files.empty") : t("desktop.workspace.empty")}</div>
          ) : (
            <ol className="file-list">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  draggable={mode === "edit"}
                  onDragStart={handleDragStart(doc.id)}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop(doc)}
                  onDragEnd={handleDragEnd}
                  className={draggingDocId === doc.id ? "dragging" : undefined}
                >
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
                <span>{mode === "analyze" ? t("desktop.mode.statusAnalyze") : t("desktop.mode.statusEdit")}</span>
              </div>
              {mode === "analyze" ? (
                <label className="command-bar">
                  <span>{t("desktop.command.label")}</span>
                  <input
                    value={commandLine}
                    onChange={(event) => setCommandLine(event.target.value)}
                    placeholder={t("desktop.command.placeholder")}
                  />
                  {slashItems.length > 0 ? (
                    <div className="slash-menu command-menu">
                      {slashItems.slice(0, 5).map((item) => (
                        <button key={item.label} type="button" onClick={() => chooseSlashItem(item.label)}>
                          <strong>{item.label}</strong>
                          <span>{item.detail}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </label>
              ) : null}
              <div className="editor-wrap">
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  readOnly={mode === "analyze"}
                  spellCheck={false}
                />
                {mode === "edit" && slashItems.length > 0 ? (
                  <div className="slash-menu">
                    {slashItems.slice(0, 5).map((item) => (
                      <button key={item.label} type="button" onClick={() => chooseSlashItem(item.label)}>
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
