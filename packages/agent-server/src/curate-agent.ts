import {
  curatePatchSchema,
  parseSlash,
  type AgentRunInvocation,
  type CuratePatch,
  type CuratePatchOp
} from "@weki/core";

type CurateDoc = {
  docId: string;
  title: string;
  path?: string;
  body: string;
  kind?: string;
};

export function runCurateAgent(invocation: AgentRunInvocation): CuratePatch {
  const documents = resolveDocuments(invocation);
  const scope = parseScope(invocation.input);
  const indexDoc = documents.find((doc) => doc.kind === "index" || doc.path?.endsWith("/_index.md"));
  const ops: CuratePatchOp[] = [];
  const rationalePerOp: string[] = [];

  for (const group of findDuplicateGroups(documents)) {
    const primary = group[0];
    ops.push({
      kind: "merge_docs",
      docIds: group.map((doc) => doc.docId),
      intoPath: primary.path ?? scopedPath(scope, `${slugify(primary.title)}.md`),
      intoTitle: primary.title,
      redirectStrategy: "stub",
      preserveHistory: true,
      evidence: {
        source: "find_duplicates",
        score: 0.9,
        note: "title/body token overlap passed the duplicate threshold with matching document kind"
      }
    });
    rationalePerOp.push(`merge_docs: duplicate signal for ${group.map((doc) => doc.title).join(", ")} with stub redirects.`);
  }

  for (const doc of documents) {
    if (ops.length >= 50 || doc.kind === "index" || doc.path?.includes("/_archive/")) {
      continue;
    }

    if (shouldSplit(doc)) {
      const cuts = headingCuts(doc).slice(0, 4);
      if (cuts.length > 0) {
        ops.push({
          kind: "split_doc",
          docId: doc.docId,
          cuts: cuts.map((cut) => ({
            at: cut.at,
            newPath: scopedPath(pathDir(doc.path ?? scope), `${slugify(cut.title)}.md`),
            newTitle: cut.title,
            carryFrontmatter: true
          })),
          leaveStub: true,
          evidence: {
            source: "read_doc",
            score: 0.72,
            note: "document length and heading boundaries indicate separable sections"
          }
        });
        rationalePerOp.push(`split_doc: ${doc.title} has ${cuts.length} clear heading boundary/boundaries and exceeds the split threshold.`);
        continue;
      }
    }

    const expectedDir = expectedDirectoryForKind(doc.kind);
    if (expectedDir && doc.path && !doc.path.startsWith(`${expectedDir}/`)) {
      ops.push({
        kind: "move_doc",
        docId: doc.docId,
        newPath: `${expectedDir}/${slugify(doc.title)}.md`,
        relink: true,
        leaveStub: true,
        evidence: {
          source: "frontmatter.kind",
          score: 1,
          note: `document kind ${doc.kind} does not match path ${doc.path}`
        }
      });
      rationalePerOp.push(`move_doc: ${doc.title} path does not match its kind and should keep backlinks via relink.`);
      continue;
    }

    if (indexDoc && doc.docId !== indexDoc.docId && !hasWikiLinks(doc.body)) {
      ops.push({
        kind: "adopt_orphan",
        docId: doc.docId,
        parentIndexDocId: indexDoc.docId,
        section: "Unlinked pages",
        evidence: {
          source: "list_links_to",
          score: 0.8,
          note: "document has no wiki links in the provided scope"
        }
      });
      rationalePerOp.push(`adopt_orphan: ${doc.title} has no visible wiki links and can be adopted by ${indexDoc.title}.`);
    }
  }

  const limitedOps = ops.slice(0, 50);
  const limitedRationales = rationalePerOp.slice(0, limitedOps.length);
  if (limitedOps.length === 0) {
    const fallback = chooseFallbackMove(documents, scope);
    limitedOps.push(fallback.op);
    limitedRationales.push(fallback.rationale);
  }

  return curatePatchSchema.parse({
    kind: "Patch",
    outputSchema: "CuratePatch",
    agentId: "curate",
    requiresApproval: true,
    ops: limitedOps,
    rationale: "Curate proposed IA-only operations. All operations require approval and preserve stubs/history by contract.",
    rationalePerOp: limitedRationales,
    previewHtml: renderCuratePreview(scope, documents, limitedOps),
    failureModesConsidered: ["F1", "F2", "F5", "F6", "F7", "F10"]
  });
}

function resolveDocuments(invocation: AgentRunInvocation): CurateDoc[] {
  const docs = invocation.context?.documents ?? [];
  if (docs.length > 0) {
    return docs.map((doc) => ({
      docId: doc.docId,
      title: doc.title,
      path: doc.path,
      body: doc.body,
      kind: doc.kind ?? inferKind(doc.path, doc.body)
    }));
  }

  return [
    {
      docId: invocation.context?.docId ?? "current-doc",
      title: invocation.context?.title ?? "Current Page",
      path: invocation.context?.path ?? "wiki/current.md",
      body: invocation.context?.body ?? invocation.input,
      kind: inferKind(invocation.context?.path, invocation.context?.body)
    }
  ];
}

function parseScope(input: string): string {
  try {
    const parsed = parseSlash(input.startsWith("/") ? input : `/curate ${input}`.trim(), {
      docId: "current-doc",
      selection: null
    });
    const raw = parsed.args.scope;
    const scope = Array.isArray(raw) ? raw[0] : raw;
    return typeof scope === "string" && scope.trim() ? scope.replace(/\/+$/g, "") : "wiki";
  } catch {
    return "wiki";
  }
}

function findDuplicateGroups(documents: readonly CurateDoc[]): CurateDoc[][] {
  const groups: CurateDoc[][] = [];
  const used = new Set<string>();
  for (const doc of documents) {
    if (used.has(doc.docId)) {
      continue;
    }
    const group = documents.filter((candidate) =>
      candidate.docId !== doc.docId &&
      !used.has(candidate.docId) &&
      candidate.kind === doc.kind &&
      tokenOverlap(doc.body || doc.title, candidate.body || candidate.title) >= 0.7
    );
    if (group.length > 0) {
      const fullGroup = [doc, ...group];
      fullGroup.forEach((item) => used.add(item.docId));
      groups.push(fullGroup);
    }
  }
  return groups;
}

function shouldSplit(doc: CurateDoc): boolean {
  return wordCount(doc.body) > 350 || headingCuts(doc).length >= 3;
}

function headingCuts(doc: CurateDoc): { at: number; title: string }[] {
  return [...doc.body.matchAll(/^#{2,3}\s+(.+)$/gm)]
    .map((match) => ({ at: match.index ?? 0, title: match[1].trim() }))
    .filter((cut) => cut.at > 0 && cut.title.length > 0);
}

function expectedDirectoryForKind(kind?: string): string | undefined {
  switch (kind) {
    case "summary":
    case "source":
      return "wiki/sources";
    case "entity":
      return "wiki/entities";
    case "concept":
      return "wiki/concepts";
    case "qa":
      return "wiki/qa";
    default:
      return undefined;
  }
}

function inferKind(pathValue?: string, body?: string): string | undefined {
  const fmKind = body?.match(/^kind:\s*([a-z_-]+)/m)?.[1];
  if (fmKind) {
    return fmKind;
  }
  if (pathValue?.includes("/entities/")) return "entity";
  if (pathValue?.includes("/concepts/")) return "concept";
  if (pathValue?.includes("/sources/")) return "source";
  if (pathValue?.includes("/qa/")) return "qa";
  if (pathValue?.endsWith("/_index.md")) return "index";
  return undefined;
}

function chooseFallbackMove(documents: readonly CurateDoc[], scope: string): { op: CuratePatchOp; rationale: string } {
  const doc = documents.find((item) => item.kind !== "index") ?? documents[0] ?? {
    docId: "current-doc",
    title: "Current Page",
    path: scopedPath(scope, "current-page.md"),
    body: ""
  };
  return {
    op: {
      kind: "move_doc",
      docId: doc.docId,
      newPath: doc.path ?? scopedPath(scope, `${slugify(doc.title)}.md`),
      relink: true,
      leaveStub: true,
      evidence: {
        source: "curate_noop_fallback",
        score: 0.5,
        note: "no stronger IA signal was available; proposer keeps the operation approval-gated"
      }
    },
    rationale: `move_doc: no stronger IA signal was available for ${doc.title}; approval gate prevents automatic application.`
  };
}

function renderCuratePreview(scope: string, documents: readonly CurateDoc[], ops: readonly CuratePatchOp[]): string {
  const rows = ops.map((op, index) =>
    `<li data-op-index="${index}" data-op-kind="${escapeHtml(op.kind)}">${escapeHtml(op.kind)} ${escapeHtml(describeOp(op))}</li>`
  ).join("");
  const tree = documents.map((doc) => `<li>${escapeHtml(doc.path ?? doc.title)}</li>`).join("");
  return `<div class="weki-curate-preview" data-scope="${escapeHtml(scope)}"><section><h3>Before</h3><ol>${tree}</ol></section><section><h3>Proposed IA ops</h3><ol>${rows}</ol></section></div>`;
}

function describeOp(op: CuratePatchOp): string {
  switch (op.kind) {
    case "split_doc":
      return `${op.docId} into ${op.cuts.map((cut) => cut.newPath).join(", ")}`;
    case "merge_docs":
      return `${op.docIds.join(", ")} into ${op.intoPath}`;
    case "move_doc":
      return `${op.docId} to ${op.newPath}`;
    case "adopt_orphan":
      return `${op.docId} under ${op.parentIndexDocId}`;
  }
}

function tokenOverlap(left: string, right: string): number {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return intersection / Math.min(leftTokens.size, rightTokens.size);
}

function tokenize(value: string): Set<string> {
  return new Set(value.toLowerCase().split(/[^\p{L}\p{N}_]+/u).filter((token) => token.length >= 3));
}

function hasWikiLinks(value: string): boolean {
  return /\[\[[^\]]+\]\]/.test(value);
}

function wordCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

function scopedPath(scope: string, leaf: string): string {
  return `${scope.replace(/\/+$/g, "")}/${leaf}`.replace(/\/+/g, "/");
}

function pathDir(pathValue: string): string {
  const parts = pathValue.split("/");
  parts.pop();
  return parts.join("/") || "wiki";
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "untitled";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
