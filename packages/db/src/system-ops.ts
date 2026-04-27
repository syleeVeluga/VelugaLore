import { createHash } from "node:crypto";
import type { DocumentKind } from "@weki/core";

export type SystemDocument = {
  id: string;
  path: string;
  title: string;
  kind: DocumentKind;
  body: string;
  frontmatter?: Record<string, unknown>;
  tags?: string[];
  author?: string;
  updatedAt?: string;
  embedding?: number[];
};

export type WorkspaceScope = {
  path?: string | string[];
  kind?: DocumentKind | DocumentKind[];
  tag?: string | string[];
  author?: string;
  since?: string;
  until?: string;
};

export type SearchMode = "rrf" | "literal" | "fuzzy" | "semantic";

export type SearchWorkspaceInput = WorkspaceScope & {
  query: string;
  documents: readonly SystemDocument[];
  queryEmbedding?: readonly number[];
  topK?: number;
  mode?: SearchMode;
  rrfK?: number;
};

export type SearchWorkspaceHit = {
  docId: string;
  path: string;
  title: string;
  snippet: string;
  score: number;
  scoreBreakdown: {
    literal: number;
    fuzzy: number;
    semantic: number;
  };
  ranks: Partial<Record<"literal" | "fuzzy" | "semantic", number>>;
};

export type GrepWorkspaceInput = WorkspaceScope & {
  pattern: string;
  documents: readonly SystemDocument[];
  outputMode?: "content" | "files_with_matches" | "count";
  context?: number;
  before?: number;
  after?: number;
  caseInsensitive?: boolean;
  multiline?: boolean;
  invertMatch?: boolean;
  wholeWord?: boolean;
  bodyOnly?: boolean;
  headLimit?: number;
  offset?: number;
};

export type GrepContentHit = {
  docId: string;
  path: string;
  line: number;
  col: number;
  match: string;
  before: string[];
  after: string[];
};

export type GrepWorkspaceResult =
  | { outputMode: "content"; hits: GrepContentHit[] }
  | { outputMode: "files_with_matches"; paths: Array<{ docId: string; path: string; matchCount: number }> }
  | { outputMode: "count"; totalMatches: number; totalFiles: number; byPath: Array<{ path: string; count: number }> };

export type DocRevision = {
  docId: string;
  rev: number;
  body: string;
  bodySha256?: string;
  frontmatter?: Record<string, unknown>;
  source: "human" | "agent" | "sync";
  actorId?: string;
  agentRunId?: string;
  committedAt?: string;
};

export type DiffLine = {
  kind: "equal" | "insert" | "delete";
  oldLine?: number;
  newLine?: number;
  text: string;
};

export type BlameLine = {
  line: number;
  text: string;
  rev: number;
  source: DocRevision["source"];
  actorId?: string;
  agentRunId?: string;
  committedAt?: string;
};

export type BrokenLinkIssue = {
  kind: "broken_wikilink";
  docId: string;
  path: string;
  line: number;
  col: number;
  target: string;
  message: string;
};

export type LintWorkspaceResult = {
  issues: BrokenLinkIssue[];
  brokenLinks: BrokenLinkIssue[];
};

type Axis = "literal" | "fuzzy" | "semantic";

type RankedAxisHit = {
  doc: SystemDocument;
  rawScore: number;
  rank: number;
};

export function searchWorkspace(input: SearchWorkspaceInput): { hits: SearchWorkspaceHit[] } {
  const docs = filterDocuments(input.documents, input);
  const mode = input.mode ?? "rrf";
  const topK = input.topK ?? 20;
  const rrfK = input.rrfK ?? 60;
  const axes: Axis[] = mode === "rrf" ? ["literal", "fuzzy", "semantic"] : [mode];
  const ranked = new Map<Axis, RankedAxisHit[]>();

  for (const axis of axes) {
    ranked.set(axis, rankAxis(axis, docs, input));
  }

  const byDoc = new Map<string, SearchWorkspaceHit>();
  for (const axis of axes) {
    for (const hit of ranked.get(axis) ?? []) {
      const existing = byDoc.get(hit.doc.id) ?? {
        docId: hit.doc.id,
        path: hit.doc.path,
        title: hit.doc.title,
        snippet: makeSnippet(hit.doc.body, input.query),
        score: 0,
        scoreBreakdown: { literal: 0, fuzzy: 0, semantic: 0 },
        ranks: {}
      };
      existing.score += mode === "rrf" ? 1 / (rrfK + hit.rank) : hit.rawScore;
      existing.scoreBreakdown[axis] = hit.rawScore;
      existing.ranks[axis] = hit.rank;
      byDoc.set(hit.doc.id, existing);
    }
  }

  return {
    hits: [...byDoc.values()]
      .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
      .slice(0, topK)
      .map((hit) => ({ ...hit, score: round4(hit.score) }))
  };
}

export function grepWorkspace(input: GrepWorkspaceInput): GrepWorkspaceResult {
  const outputMode = input.outputMode ?? "files_with_matches";
  const docs = filterDocuments(input.documents, input).sort((a, b) => a.path.localeCompare(b.path));
  const hits: GrepContentHit[] = [];
  const counts = new Map<string, { docId: string; path: string; count: number }>();
  const regex = buildRegex(input);
  const beforeCount = input.before ?? input.context ?? 0;
  const afterCount = input.after ?? input.context ?? 0;

  for (const doc of docs) {
    const content = input.bodyOnly === false ? withFrontmatter(doc) : doc.body;
    const lineStarts = computeLineStarts(content);
    const lines = content.split(/\r?\n/);
    const docHits = input.multiline
      ? multilineMatches(doc, content, regex, lineStarts, lines, beforeCount, afterCount, Boolean(input.invertMatch))
      : lineMatches(doc, lines, regex, beforeCount, afterCount, Boolean(input.invertMatch));

    for (const hit of docHits) {
      const current = counts.get(doc.path) ?? { docId: doc.id, path: doc.path, count: 0 };
      current.count += 1;
      counts.set(doc.path, current);
      hits.push(hit);
    }
  }

  const offset = input.offset ?? 0;
  const limit = input.headLimit ?? 100;
  const pagedHits = hits.slice(offset, offset + limit);

  if (outputMode === "content") {
    return { outputMode, hits: pagedHits };
  }

  const byPath = [...counts.values()].sort((a, b) => a.path.localeCompare(b.path));
  if (outputMode === "count") {
    return {
      outputMode,
      totalMatches: byPath.reduce((sum, item) => sum + item.count, 0),
      totalFiles: byPath.length,
      byPath: byPath.map(({ path, count }) => ({ path, count })).slice(offset, offset + limit)
    };
  }

  return {
    outputMode,
    paths: byPath.map(({ docId, path, count }) => ({ docId, path, matchCount: count })).slice(offset, offset + limit)
  };
}

export function diffRevisions(oldRevision: DocRevision, newRevision: DocRevision): { lines: DiffLine[] } {
  return { lines: diffLines(splitLines(oldRevision.body), splitLines(newRevision.body)) };
}

export function blameRevisionLines(revisions: readonly DocRevision[]): { lines: BlameLine[] } {
  const ordered = [...revisions].sort((a, b) => a.rev - b.rev);
  const first = ordered[0];
  if (!first) {
    return { lines: [] };
  }

  let ownership = splitLines(first.body).map((text) => blameFor(first, text));
  for (const revision of ordered.slice(1)) {
    const currentLines = ownership.map((line) => line.text);
    const nextLines = splitLines(revision.body);
    const diff = diffLines(currentLines, nextLines);
    const nextOwnership: BlameLine[] = [];
    let oldIndex = 0;
    for (const line of diff) {
      if (line.kind === "equal") {
        const owned = ownership[oldIndex];
        if (owned) {
          nextOwnership.push({ ...owned, text: line.text });
        }
        oldIndex += 1;
        continue;
      }
      if (line.kind === "delete") {
        oldIndex += 1;
        continue;
      }
      nextOwnership.push(blameFor(revision, line.text));
    }
    ownership = nextOwnership;
  }

  return {
    lines: ownership.map((line, index) => ({ ...line, line: index + 1 }))
  };
}

export function planRevisionRevert(input: {
  current: SystemDocument & { rev: number };
  target: DocRevision;
  source: DocRevision["source"];
  agentRunId?: string;
}): { document: SystemDocument & { rev: number; bodySha256: string }; version: DocRevision } {
  const restored = {
    ...input.current,
    body: input.target.body,
    frontmatter: { ...(input.target.frontmatter ?? {}) },
    rev: input.current.rev + 1,
    bodySha256: systemSha256Hex(input.target.body)
  };
  return {
    document: restored,
    version: {
      docId: input.current.id,
      rev: restored.rev,
      body: restored.body,
      bodySha256: restored.bodySha256,
      frontmatter: restored.frontmatter,
      source: input.source,
      agentRunId: input.agentRunId
    }
  };
}

export function lintWorkspace(input: { documents: readonly SystemDocument[] } & WorkspaceScope): LintWorkspaceResult {
  const docs = filterDocuments(input.documents, input);
  const targets = new Set<string>();
  for (const doc of input.documents) {
    targets.add(doc.title);
    targets.add(doc.path);
    targets.add(doc.path.replace(/\.md$/i, ""));
    const basename = doc.path.split("/").at(-1) ?? doc.path;
    targets.add(basename.replace(/\.md$/i, ""));
  }

  const brokenLinks: BrokenLinkIssue[] = [];
  for (const doc of docs) {
    const lineStarts = computeLineStarts(doc.body);
    const regex = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
    for (const match of doc.body.matchAll(regex)) {
      const rawTarget = match[1]?.trim();
      if (!rawTarget) {
        continue;
      }
      if (!targets.has(rawTarget) && !targets.has(rawTarget.replace(/\.md$/i, ""))) {
        const position = lineColFromIndex(lineStarts, match.index ?? 0);
        brokenLinks.push({
          kind: "broken_wikilink",
          docId: doc.id,
          path: doc.path,
          line: position.line,
          col: position.col,
          target: rawTarget,
          message: `Broken wiki link: [[${rawTarget}]]`
        });
      }
    }
  }

  return { issues: brokenLinks, brokenLinks };
}

export function systemSha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function filterDocuments<T extends SystemDocument>(documents: readonly T[], scope: WorkspaceScope): T[] {
  const paths = asArray(scope.path);
  const kinds = asArray(scope.kind);
  const tags = asArray(scope.tag);
  const since = scope.since ? Date.parse(scope.since) : undefined;
  const until = scope.until ? Date.parse(scope.until) : undefined;

  return documents.filter((doc) => {
    if (paths.length > 0 && !paths.some((pattern) => globMatch(pattern, doc.path))) {
      return false;
    }
    if (kinds.length > 0 && !kinds.includes(doc.kind)) {
      return false;
    }
    if (tags.length > 0 && !tags.every((tag) => doc.tags?.includes(tag))) {
      return false;
    }
    if (scope.author && doc.author !== scope.author) {
      return false;
    }
    const updatedAt = doc.updatedAt ? Date.parse(doc.updatedAt) : undefined;
    if (since !== undefined && updatedAt !== undefined && updatedAt < since) {
      return false;
    }
    if (until !== undefined && updatedAt !== undefined && updatedAt > until) {
      return false;
    }
    return true;
  });
}

function rankAxis(axis: Axis, docs: readonly SystemDocument[], input: SearchWorkspaceInput): RankedAxisHit[] {
  return docs
    .map((doc) => ({ doc, rawScore: axisScore(axis, doc, input) }))
    .filter((hit) => hit.rawScore > 0)
    .sort((a, b) => b.rawScore - a.rawScore || a.doc.path.localeCompare(b.doc.path))
    .map((hit, index) => ({ ...hit, rank: index + 1 }));
}

function axisScore(axis: Axis, doc: SystemDocument, input: SearchWorkspaceInput): number {
  if (axis === "literal") {
    return literalScore(`${doc.title}\n${doc.body}`, input.query);
  }
  if (axis === "fuzzy") {
    return trigramSimilarity(`${doc.title}\n${doc.body}`, input.query);
  }
  if (!input.queryEmbedding || !doc.embedding) {
    return 0;
  }
  return Math.max(0, cosineSimilarity(input.queryEmbedding, doc.embedding));
}

function literalScore(text: string, query: string): number {
  const haystack = text.toLowerCase();
  const normalizedQuery = query.toLowerCase().trim();
  if (!normalizedQuery) {
    return 0;
  }
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  const termHits = terms.filter((term) => haystack.includes(term)).length;
  const phraseBonus = haystack.includes(normalizedQuery) ? 1 : 0;
  return round4((termHits / Math.max(terms.length, 1)) + phraseBonus);
}

function trigramSimilarity(text: string, query: string): number {
  const a = trigrams(text.toLowerCase());
  const b = trigrams(query.toLowerCase());
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  let overlap = 0;
  for (const gram of a) {
    if (b.has(gram)) {
      overlap += 1;
    }
  }
  return round4((2 * overlap) / (a.size + b.size));
}

function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < length; index += 1) {
    const av = a[index] ?? 0;
    const bv = b[index] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return round4(dot / (Math.sqrt(normA) * Math.sqrt(normB)));
}

function trigrams(value: string): Set<string> {
  const normalized = `  ${value.replace(/\s+/g, " ").trim()}  `;
  const grams = new Set<string>();
  for (let index = 0; index <= normalized.length - 3; index += 1) {
    grams.add(normalized.slice(index, index + 3));
  }
  return grams;
}

function makeSnippet(body: string, query: string): string {
  const lowerBody = body.toLowerCase();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const firstIndex = terms.map((term) => lowerBody.indexOf(term)).filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, firstIndex - 100);
  return body.slice(start, Math.min(body.length, firstIndex + 100)).replace(/\s+/g, " ").trim();
}

function buildRegex(input: GrepWorkspaceInput): RegExp {
  const source = input.wholeWord ? `\\b(?:${input.pattern})\\b` : input.pattern;
  const flags = `${input.caseInsensitive ? "i" : ""}${input.multiline ? "gms" : "g"}`;
  return new RegExp(source, flags);
}

function lineMatches(
  doc: SystemDocument,
  lines: readonly string[],
  regex: RegExp,
  beforeCount: number,
  afterCount: number,
  invertMatch: boolean
): GrepContentHit[] {
  const hits: GrepContentHit[] = [];
  for (const [index, line] of lines.entries()) {
    const lineRegex = new RegExp(regex.source, regex.flags.replace("g", ""));
    const matched = lineRegex.exec(line);
    if (invertMatch) {
      if (!matched) {
        hits.push({
          docId: doc.id,
          path: doc.path,
          line: index + 1,
          col: 1,
          match: line,
          before: contextLines(lines, index - beforeCount, index),
          after: contextLines(lines, index + 1, index + 1 + afterCount)
        });
      }
      continue;
    }
    if (!matched) {
      continue;
    }
    hits.push({
      docId: doc.id,
      path: doc.path,
      line: index + 1,
      col: matched.index + 1,
      match: matched[0],
      before: contextLines(lines, index - beforeCount, index),
      after: contextLines(lines, index + 1, index + 1 + afterCount)
    });
  }
  return hits;
}

function multilineMatches(
  doc: SystemDocument,
  content: string,
  regex: RegExp,
  lineStarts: readonly number[],
  lines: readonly string[],
  beforeCount: number,
  afterCount: number,
  invertMatch: boolean
): GrepContentHit[] {
  const hits: GrepContentHit[] = [];
  const matchedLines = new Set<number>();

  for (const match of content.matchAll(regex)) {
    const index = match.index ?? 0;
    const position = lineColFromIndex(lineStarts, index);
    const endPosition = lineColFromIndex(lineStarts, Math.max(index, index + match[0].length - 1));
    for (let line = position.line; line <= endPosition.line; line += 1) {
      matchedLines.add(line);
    }
    if (invertMatch) {
      continue;
    }
    hits.push({
      docId: doc.id,
      path: doc.path,
      line: position.line,
      col: position.col,
      match: match[0],
      before: contextLines(lines, position.line - 1 - beforeCount, position.line - 1),
      after: contextLines(lines, position.line, position.line + afterCount)
    });
  }

  if (invertMatch) {
    for (const [index, line] of lines.entries()) {
      if (!matchedLines.has(index + 1)) {
        hits.push({
          docId: doc.id,
          path: doc.path,
          line: index + 1,
          col: 1,
          match: line,
          before: contextLines(lines, index - beforeCount, index),
          after: contextLines(lines, index + 1, index + 1 + afterCount)
        });
      }
    }
  }

  return hits;
}

function contextLines(lines: readonly string[], start: number, end: number): string[] {
  return lines.slice(Math.max(0, start), Math.max(0, end));
}

function diffLines(oldLines: readonly string[], newLines: readonly string[]): DiffLine[] {
  const table = lcsTable(oldLines, newLines);
  const output: DiffLine[] = [];
  let oldIndex = 0;
  let newIndex = 0;

  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    if (oldIndex < oldLines.length && newIndex < newLines.length && oldLines[oldIndex] === newLines[newIndex]) {
      output.push({ kind: "equal", oldLine: oldIndex + 1, newLine: newIndex + 1, text: oldLines[oldIndex] ?? "" });
      oldIndex += 1;
      newIndex += 1;
      continue;
    }
    if (
      newIndex < newLines.length &&
      (oldIndex === oldLines.length || table[oldIndex]?.[newIndex + 1] > (table[oldIndex + 1]?.[newIndex] ?? 0))
    ) {
      output.push({ kind: "insert", newLine: newIndex + 1, text: newLines[newIndex] ?? "" });
      newIndex += 1;
      continue;
    }
    if (oldIndex < oldLines.length) {
      output.push({ kind: "delete", oldLine: oldIndex + 1, text: oldLines[oldIndex] ?? "" });
      oldIndex += 1;
    }
  }

  return output;
}

function lcsTable(a: readonly string[], b: readonly string[]): number[][] {
  const table = Array.from({ length: a.length + 1 }, () => Array.from({ length: b.length + 1 }, () => 0));
  for (let oldIndex = a.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = b.length - 1; newIndex >= 0; newIndex -= 1) {
      table[oldIndex]![newIndex] = a[oldIndex] === b[newIndex]
        ? (table[oldIndex + 1]?.[newIndex + 1] ?? 0) + 1
        : Math.max(table[oldIndex + 1]?.[newIndex] ?? 0, table[oldIndex]?.[newIndex + 1] ?? 0);
    }
  }
  return table;
}

function blameFor(revision: DocRevision, text: string): BlameLine {
  return {
    line: 0,
    text,
    rev: revision.rev,
    source: revision.source,
    actorId: revision.actorId,
    agentRunId: revision.agentRunId,
    committedAt: revision.committedAt
  };
}

function splitLines(body: string): string[] {
  return body.length === 0 ? [] : body.split(/\r?\n/);
}

function withFrontmatter(doc: SystemDocument): string {
  const entries = Object.entries(doc.frontmatter ?? {});
  if (entries.length === 0) {
    return doc.body;
  }
  const yaml = entries.map(([key, value]) => `${key}: ${String(value)}`).join("\n");
  return `---\n${yaml}\n---\n${doc.body}`;
}

function computeLineStarts(content: string): number[] {
  const starts = [0];
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "\n") {
      starts.push(index + 1);
    }
  }
  return starts;
}

function lineColFromIndex(lineStarts: readonly number[], index: number): { line: number; col: number } {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const start = lineStarts[mid] ?? 0;
    const next = lineStarts[mid + 1] ?? Number.POSITIVE_INFINITY;
    if (index >= start && index < next) {
      return { line: mid + 1, col: index - start + 1 };
    }
    if (index < start) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  return { line: 1, col: index + 1 };
}

function globMatch(pattern: string, path: string): boolean {
  const normalizedPattern = pattern.replace(/\\/g, "/");
  const normalizedPath = path.replace(/\\/g, "/");
  if (!normalizedPattern.includes("*")) {
    return normalizedPath === normalizedPattern || normalizedPath.startsWith(`${normalizedPattern.replace(/\/$/, "")}/`);
  }
  let source = "";
  for (let index = 0; index < normalizedPattern.length; index += 1) {
    const char = normalizedPattern[index];
    const next = normalizedPattern[index + 1];
    if (char === "*" && next === "*") {
      source += ".*";
      index += 1;
      continue;
    }
    if (char === "*") {
      source += "[^/]*";
      continue;
    }
    source += /[.+^${}()|[\]\\]/.test(char ?? "") ? `\\${char}` : char;
  }
  return new RegExp(`^${source}$`).test(normalizedPath);
}

function asArray<T>(value: T | readonly T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? Array.from(value as readonly T[]) : [value as T];
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}
