import { packageBoundarySchema, type PackageBoundary } from "@weki/core";

export const markdownLspPackage: PackageBoundary = packageBoundarySchema.parse({
  name: "@weki/markdown-lsp",
  responsibility: "markdown diagnostics"
});

export type MarkdownDiagnosticCode = "broken-link" | "orphan-node";
export type MarkdownDiagnosticSeverity = "warning" | "info";

export interface MarkdownDocumentSnapshot {
  id: string;
  path: string;
  body: string;
  title?: string;
}

export interface MarkdownDiagnostic {
  code: MarkdownDiagnosticCode;
  severity: MarkdownDiagnosticSeverity;
  message: string;
  docId: string;
  range?: { from: number; to: number };
  target?: string;
}

type IndexedDocument = MarkdownDocumentSnapshot & {
  keys: Set<string>;
  outgoing: LinkReference[];
};

type LinkReference = {
  raw: string;
  key: string;
  from: number;
  to: number;
};

export class MarkdownDiagnosticIndex {
  private readonly docs = new Map<string, IndexedDocument>();
  private readonly keyOwners = new Map<string, Set<string>>();
  private readonly incomingByDoc = new Map<string, Set<string>>();

  constructor(documents: readonly MarkdownDocumentSnapshot[] = []) {
    for (const document of documents) {
      this.addIndexedDocument(indexDocument(document));
    }
    this.rebuildIncoming();
  }

  upsertDocument(document: MarkdownDocumentSnapshot): void {
    this.removeDocument(document.id);
    this.addIndexedDocument(indexDocument(document));
    this.rebuildIncoming();
  }

  removeDocument(docId: string): void {
    const existing = this.docs.get(docId);
    if (!existing) {
      return;
    }

    for (const key of existing.keys) {
      const owners = this.keyOwners.get(key);
      owners?.delete(docId);
      if (owners?.size === 0) {
        this.keyOwners.delete(key);
      }
    }

    this.docs.delete(docId);
    this.rebuildIncoming();
  }

  diagnoseDocument(docId: string): MarkdownDiagnostic[] {
    const document = this.docs.get(docId);
    if (!document) {
      return [];
    }

    const diagnostics: MarkdownDiagnostic[] = [];
    const seenBroken = new Set<string>();
    for (const link of document.outgoing) {
      if (this.resolveLink(link.key)) {
        continue;
      }
      const key = `${link.raw}:${link.from}`;
      if (seenBroken.has(key)) {
        continue;
      }
      seenBroken.add(key);
      diagnostics.push({
        code: "broken-link",
        severity: "warning",
        message: `Broken wiki link: [[${link.raw}]]`,
        docId,
        range: { from: link.from, to: link.to },
        target: link.raw
      });
    }

    if (!document.path.endsWith("/_index.md") && (this.incomingByDoc.get(docId)?.size ?? 0) === 0) {
      diagnostics.push({
        code: "orphan-node",
        severity: "info",
        message: "Document has no incoming wiki links.",
        docId
      });
    }

    return diagnostics;
  }

  applyChange(document: MarkdownDocumentSnapshot): MarkdownDiagnostic[] {
    this.upsertDocument(document);
    return this.diagnoseDocument(document.id);
  }

  diagnoseWorkspace(): Map<string, MarkdownDiagnostic[]> {
    const diagnostics = new Map<string, MarkdownDiagnostic[]>();
    for (const docId of this.docs.keys()) {
      diagnostics.set(docId, this.diagnoseDocument(docId));
    }
    return diagnostics;
  }

  private resolveLink(key: string): string | undefined {
    const owners = this.keyOwners.get(key);
    if (!owners || owners.size === 0) {
      return undefined;
    }
    return owners.values().next().value;
  }

  private addIndexedDocument(indexed: IndexedDocument): void {
    this.docs.set(indexed.id, indexed);
    for (const key of indexed.keys) {
      let owners = this.keyOwners.get(key);
      if (!owners) {
        owners = new Set<string>();
        this.keyOwners.set(key, owners);
      }
      owners.add(indexed.id);
    }
  }

  private rebuildIncoming(): void {
    this.incomingByDoc.clear();
    for (const document of this.docs.values()) {
      for (const link of document.outgoing) {
        const target = this.resolveLink(link.key);
        if (!target || target === document.id) {
          continue;
        }
        let sources = this.incomingByDoc.get(target);
        if (!sources) {
          sources = new Set<string>();
          this.incomingByDoc.set(target, sources);
        }
        sources.add(document.id);
      }
    }
  }
}

export function createMarkdownDiagnosticIndex(
  documents: readonly MarkdownDocumentSnapshot[] = []
): MarkdownDiagnosticIndex {
  return new MarkdownDiagnosticIndex(documents);
}

function indexDocument(document: MarkdownDocumentSnapshot): IndexedDocument {
  return {
    ...document,
    keys: documentKeys(document),
    outgoing: extractWikiLinks(document.body)
  };
}

function documentKeys(document: MarkdownDocumentSnapshot): Set<string> {
  const keys = new Set<string>();
  const normalizedPath = normalizeKey(document.path);
  const pathWithoutExt = normalizedPath.replace(/\.md$/, "");
  const basename = pathWithoutExt.split("/").at(-1);
  const title = document.title ?? extractFirstHeading(document.body) ?? basename;

  for (const key of [normalizedPath, pathWithoutExt, basename, title]) {
    const normalized = normalizeKey(key ?? "");
    if (normalized) {
      keys.add(normalized);
    }
  }

  return keys;
}

function extractWikiLinks(body: string): LinkReference[] {
  const links: LinkReference[] = [];
  const pattern = /\[\[([^\]\r\n]+)\]\]/g;
  for (const match of body.matchAll(pattern)) {
    const raw = match[1].split("|")[0].split("#")[0].trim();
    const from = match.index ?? 0;
    if (!raw) {
      continue;
    }
    links.push({
      raw,
      key: normalizeKey(raw),
      from,
      to: from + match[0].length
    });
  }
  return links;
}

function extractFirstHeading(body: string): string | undefined {
  return /^#\s+(.+)$/m.exec(body)?.[1].trim();
}

function normalizeKey(value: string): string {
  return value.replaceAll("\\", "/").replace(/\.md$/i, "").trim().toLowerCase();
}
