import { createHash } from "node:crypto";
import type { CuratePatchOp, DocumentKind, LinkKind } from "@weki/core";

export type IaDocument = {
  id: string;
  path: string;
  title: string;
  kind: DocumentKind;
  body: string;
  frontmatter?: Record<string, unknown>;
  rev: number;
  bodySha256: string;
  lastEditor: "human" | "agent";
};

export type IaLink = {
  srcDocId: string;
  dstDocId: string;
  kind: LinkKind;
  occurrences: number;
};

export type IaDocVersion = {
  docId: string;
  rev: number;
  body: string;
  bodySha256: string;
  source: "human" | "agent" | "sync";
  agentRunId?: string;
};

export type IaAuditEvent = {
  action: string;
  targetKind: string;
  targetId: string;
  payload: Record<string, unknown>;
};

export type IaWorkspaceState = {
  documents: IaDocument[];
  links: IaLink[];
  versions: IaDocVersion[];
  auditLog: IaAuditEvent[];
};

export type CurateRunJournal = {
  runId: string;
  before: IaWorkspaceState;
  appliedOps: CuratePatchOp[];
};

export function applyCurateRun(
  state: IaWorkspaceState,
  input: { runId: string; ops: readonly CuratePatchOp[] }
): { state: IaWorkspaceState; journal: CurateRunJournal } {
  let next = cloneState(state);
  const before = cloneState(state);

  for (const op of input.ops) {
    next = applyIaOp(next, input.runId, op);
  }

  next.auditLog.push({
    action: "curate.apply",
    targetKind: "agent_run",
    targetId: input.runId,
    payload: { op_count: input.ops.length, op_kinds: input.ops.map((op) => op.kind) }
  });

  return {
    state: next,
    journal: {
      runId: input.runId,
      before,
      appliedOps: [...input.ops]
    }
  };
}

export function revertCurateRun(
  state: IaWorkspaceState,
  journal: CurateRunJournal
): IaWorkspaceState {
  const restored = cloneState(journal.before);
  restored.auditLog.push(...state.auditLog.slice(journal.before.auditLog.length).map((event) => ({
    ...event,
    payload: { ...event.payload }
  })));
  restored.auditLog.push({
    action: "curate.revert",
    targetKind: "agent_run",
    targetId: journal.runId,
    payload: { reverted_op_count: journal.appliedOps.length }
  });
  return restored;
}

export function verifyBacklinkTargets(state: IaWorkspaceState): { ok: boolean; missing: IaLink[] } {
  const ids = new Set(state.documents.map((doc) => doc.id));
  const missing = state.links.filter((link) => !ids.has(link.srcDocId) || !ids.has(link.dstDocId));
  return { ok: missing.length === 0, missing };
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function applyIaOp(state: IaWorkspaceState, runId: string, op: CuratePatchOp): IaWorkspaceState {
  switch (op.kind) {
    case "move_doc":
      return applyMoveDoc(state, runId, op.docId, op.newPath, op.leaveStub, op.relink);
    case "merge_docs":
      return applyMergeDocs(state, runId, op.docIds, op.intoPath, op.intoTitle, op.redirectStrategy === "stub");
    case "split_doc":
      return applySplitDoc(state, runId, op.docId, op.cuts, op.leaveStub);
    case "adopt_orphan":
      return applyAdoptOrphan(state, runId, op.docId, op.parentIndexDocId, op.section);
  }
}

function applyMoveDoc(
  state: IaWorkspaceState,
  runId: string,
  docId: string,
  newPath: string,
  leaveStub = true,
  relink = true
): IaWorkspaceState {
  const next = cloneState(state);
  const doc = requireDocument(next, docId);
  snapshotVersion(next, doc, runId);
  const oldPath = doc.path;
  const oldTitle = doc.title;
  doc.path = newPath;
  doc.title = titleFromPath(newPath);
  bump(doc, runId);

  if (leaveStub) {
    next.documents.push(stubFor(doc, oldPath, oldTitle, runId));
  }
  if (relink) {
    rewriteWikiLinks(next, oldTitle, doc.title, runId);
  }
  return next;
}

function applyMergeDocs(
  state: IaWorkspaceState,
  runId: string,
  docIds: readonly string[],
  intoPath: string,
  intoTitle: string,
  leaveStubs: boolean
): IaWorkspaceState {
  const next = cloneState(state);
  const [targetId, ...sourceIds] = docIds;
  const target = requireDocument(next, targetId);
  const sources = sourceIds.map((id) => requireDocument(next, id));
  [target, ...sources].forEach((doc) => snapshotVersion(next, doc, runId));

  target.path = intoPath;
  target.title = intoTitle;
  target.body = [target, ...sources].map((doc) => doc.body.trim()).filter(Boolean).join("\n\n---\n\n");
  bump(target, runId);

  for (const source of sources) {
    next.links = next.links.map((link) => ({
      ...link,
      srcDocId: link.srcDocId === source.id ? target.id : link.srcDocId,
      dstDocId: link.dstDocId === source.id ? target.id : link.dstDocId
    }));
    if (leaveStubs) {
      next.documents.push(stubFor(target, source.path, source.title, runId));
    }
  }
  next.documents = next.documents.filter((doc) => !sources.some((source) => source.id === doc.id));
  return dedupeLinks(next);
}

function applySplitDoc(
  state: IaWorkspaceState,
  runId: string,
  docId: string,
  cuts: readonly { at: number; newPath: string; newTitle: string; carryFrontmatter?: boolean }[],
  leaveStub = true
): IaWorkspaceState {
  const next = cloneState(state);
  const doc = requireDocument(next, docId);
  snapshotVersion(next, doc, runId);
  const orderedCuts = [...cuts].sort((a, b) => a.at - b.at);
  for (const [index, cut] of orderedCuts.entries()) {
    const nextCut = orderedCuts[index + 1];
    const body = doc.body.slice(cut.at, nextCut?.at ?? doc.body.length).trim();
    const splitDoc: IaDocument = {
      id: `${doc.id}:split:${index + 1}:${runId}`,
      path: cut.newPath,
      title: cut.newTitle,
      kind: doc.kind,
      body,
      frontmatter: cut.carryFrontmatter === false ? {} : { ...doc.frontmatter },
      rev: 1,
      bodySha256: sha256Hex(body),
      lastEditor: "agent"
    };
    next.documents.push(splitDoc);
    next.versions.push(versionFor(splitDoc, runId));
  }
  if (leaveStub) {
    doc.kind = "stub";
    doc.body = `# ${doc.title}\n\nThis page was split into ${orderedCuts.map((cut) => `[[${cut.newTitle}]]`).join(", ")}.`;
  }
  bump(doc, runId);
  return next;
}

function applyAdoptOrphan(
  state: IaWorkspaceState,
  runId: string,
  docId: string,
  parentIndexDocId: string,
  section = "Adopted pages"
): IaWorkspaceState {
  const next = cloneState(state);
  const doc = requireDocument(next, docId);
  const parent = requireDocument(next, parentIndexDocId);
  snapshotVersion(next, parent, runId);
  if (!parent.body.includes(`[[${doc.title}]]`)) {
    const sectionHeading = `## ${section}`;
    parent.body = parent.body.includes(sectionHeading)
      ? `${parent.body.trim()}\n- [[${doc.title}]]\n`
      : `${parent.body.trim()}\n\n${sectionHeading}\n\n- [[${doc.title}]]\n`;
    bump(parent, runId);
  }
  next.links.push({ srcDocId: parent.id, dstDocId: doc.id, kind: "wikilink", occurrences: 1 });
  return dedupeLinks(next);
}

function requireDocument(state: IaWorkspaceState, docId: string): IaDocument {
  const doc = state.documents.find((candidate) => candidate.id === docId);
  if (!doc) {
    throw new Error(`DOCUMENT_NOT_FOUND:${docId}`);
  }
  return doc;
}

function snapshotVersion(state: IaWorkspaceState, doc: IaDocument, runId: string): void {
  if (!state.versions.some((version) => version.docId === doc.id && version.rev === doc.rev)) {
    state.versions.push(versionFor(doc, runId));
  }
}

function versionFor(doc: IaDocument, runId: string): IaDocVersion {
  return {
    docId: doc.id,
    rev: doc.rev,
    body: doc.body,
    bodySha256: doc.bodySha256,
    source: doc.lastEditor,
    agentRunId: runId
  };
}

function bump(doc: IaDocument, runId: string): void {
  doc.rev += 1;
  doc.bodySha256 = sha256Hex(doc.body);
  doc.lastEditor = "agent";
  doc.frontmatter = { ...doc.frontmatter, _curate: { run_id: runId } };
}

function stubFor(target: IaDocument, oldPath: string, oldTitle: string, runId: string): IaDocument {
  const body = `# ${oldTitle}\n\nMoved to [[${target.title}]].`;
  return {
    id: `${target.id}:stub:${oldPath}:${runId}`,
    path: oldPath,
    title: oldTitle,
    kind: "stub",
    body,
    frontmatter: { redirect_to: target.path, _curate: { run_id: runId } },
    rev: 1,
    bodySha256: sha256Hex(body),
    lastEditor: "agent"
  };
}

function rewriteWikiLinks(state: IaWorkspaceState, oldTitle: string, newTitle: string, runId: string): void {
  for (const doc of state.documents) {
    const rewritten = doc.body.replaceAll(`[[${oldTitle}]]`, `[[${newTitle}]]`);
    if (rewritten !== doc.body) {
      snapshotVersion(state, doc, runId);
      doc.body = rewritten;
      bump(doc, runId);
    }
  }
}

function dedupeLinks(state: IaWorkspaceState): IaWorkspaceState {
  const byKey = new Map<string, IaLink>();
  for (const link of state.links) {
    const key = `${link.srcDocId}:${link.dstDocId}:${link.kind}`;
    const existing = byKey.get(key);
    byKey.set(key, existing ? { ...existing, occurrences: existing.occurrences + link.occurrences } : { ...link });
  }
  return { ...state, links: [...byKey.values()] };
}

function cloneState(state: IaWorkspaceState): IaWorkspaceState {
  return {
    documents: state.documents.map((doc) => ({
      ...doc,
      frontmatter: doc.frontmatter ? { ...doc.frontmatter } : undefined
    })),
    links: state.links.map((link) => ({ ...link })),
    versions: state.versions.map((version) => ({ ...version })),
    auditLog: state.auditLog.map((event) => ({ ...event, payload: { ...event.payload } }))
  };
}

function titleFromPath(pathValue: string): string {
  const leaf = pathValue.split("/").filter(Boolean).at(-1) ?? "Untitled.md";
  const base = leaf.replace(/\.md$/i, "").replace(/[-_]+/g, " ");
  return base.split(/\s+/).filter(Boolean).map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`).join(" ");
}
