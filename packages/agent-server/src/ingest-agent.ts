import {
  ingestPatchSchema,
  parseSlash,
  type AgentRunInvocation,
  type IngestPatch,
  type RawSourceRef
} from "@weki/core";

type Topic = {
  title: string;
  kind: "concept" | "entity";
  evidence: string;
};

export function runIngestAgent(invocation: AgentRunInvocation): IngestPatch {
  const raw = resolveRawSource(invocation);
  const text = raw.text?.trim() || stripIngestVerb(invocation.input) || raw.uri;
  const baseTitle = titleFromUri(raw.uri);
  const slug = slugify(baseTitle) || `raw-${hashString(raw.sha256).slice(0, 8)}`;
  const importedAt = new Date().toISOString();
  const topics = extractTopics(text, baseTitle).slice(0, 9);
  const createDocOps = [
    {
      kind: "create_doc" as const,
      path: `wiki/sources/${slug}.md`,
      title: `${baseTitle} Summary`,
      docKind: "summary" as const,
      body: renderSummaryBody(baseTitle, text, topics),
      frontmatter: ingestFrontmatter("summary", raw, importedAt, 0.82)
    },
    ...topics.map((topic) => ({
      kind: "create_doc" as const,
      path: `wiki/${topic.kind === "entity" ? "entities" : "concepts"}/${slugify(topic.title)}.md`,
      title: topic.title,
      docKind: topic.kind,
      body: renderTopicBody(topic, baseTitle),
      frontmatter: ingestFrontmatter(topic.kind, raw, importedAt, 0.76)
    }))
  ].slice(0, 10);

  const indexEntries = createDocOps.map((op) => ({
    path: op.path,
    title: op.title,
    docKind: op.docKind,
    sourceDocIds: [raw.rawId],
    action: "upsert" as const
  }));

  const ops = [
    ...createDocOps,
    {
      kind: "update_index" as const,
      indexPath: "wiki/sources/_index.md",
      entries: indexEntries
    },
    {
      kind: "append_log" as const,
      logPath: "wiki/log/ingest.md",
      line: `${importedAt} ingested ${raw.uri} into ${createDocOps.length} wiki nodes`,
      frontmatter: { rawId: raw.rawId, sha256: raw.sha256 }
    }
  ];

  return ingestPatchSchema.parse({
    kind: "Patch",
    outputSchema: "IngestPatch",
    agentId: "ingest",
    requiresApproval: true,
    rationale: `Stored immutable raw ${raw.rawId} and fanned it out into ${createDocOps.length} wiki nodes.`,
    fanOut: {
      summary: 1,
      entities: createDocOps.filter((op) => op.docKind === "entity").length,
      concepts: createDocOps.filter((op) => op.docKind === "concept").length,
      updatedExisting: 0
    },
    ops
  });
}

function resolveRawSource(invocation: AgentRunInvocation): RawSourceRef {
  const explicit = invocation.context?.rawSource;
  if (explicit) {
    return explicit;
  }

  const source = parseIngestSource(invocation.input);
  const text = invocation.context?.body?.trim() || stripIngestVerb(invocation.input);
  return {
    rawId: `raw-${hashString(`${source.uri}:${text}`)}`,
    uri: source.uri,
    mime: source.mime,
    sha256: hashString(text || source.uri),
    bytes: Buffer.byteLength(text || source.uri, "utf8"),
    text
  };
}

function parseIngestSource(input: string): { uri: string; mime: string } {
  try {
    const parsed = parseSlash(input.startsWith("/") ? input : `/ingest ${input}`.trim(), {
      docId: "current-doc",
      selection: null
    });
    const path = argToString(parsed.args.path);
    const url = argToString(parsed.args.url);
    const uri = url ?? (path ? `file://${path}` : undefined);
    return { uri: uri ?? "inline://ingest", mime: mimeFromUri(uri ?? "") };
  } catch {
    return { uri: "inline://ingest", mime: "text/markdown" };
  }
}

function argToString(value: unknown): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" && first.trim() ? first : undefined;
}

function ingestFrontmatter(
  kind: "summary" | "entity" | "concept",
  raw: RawSourceRef,
  importedAt: string,
  confidence: number
): Record<string, unknown> {
  return {
    kind,
    sources: [raw.rawId],
    importedAt,
    confidence,
    raw: {
      rawId: raw.rawId,
      uri: raw.uri,
      mime: raw.mime,
      sha256: raw.sha256,
      bytes: raw.bytes
    }
  };
}

function extractTopics(text: string, baseTitle: string): Topic[] {
  const sentences = text.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
  const candidates = rankedTerms(text)
    .filter((term) => term !== slugify(baseTitle))
    .slice(0, 8);
  const topics = candidates.map((term) => ({
    title: titleCase(term.replace(/-/g, " ")),
    kind: /^[A-Z][A-Za-z0-9]+/.test(term) ? "entity" as const : "concept" as const,
    evidence: sentences.find((sentence) => tokenize(sentence).has(term)) ?? sentences[0] ?? text
  }));

  while (topics.length < 2) {
    topics.push({
      title: topics.length === 0 ? "Key Context" : "Source Notes",
      kind: "concept",
      evidence: sentences[topics.length] ?? text
    });
  }

  return topics;
}

function rankedTerms(text: string): string[] {
  const counts = new Map<string, number>();
  for (const token of tokenize(text)) {
    if (stopWords.has(token)) {
      continue;
    }
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([term]) => term);
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}_]+/u)
      .filter((term) => term.length >= 3)
  );
}

function renderSummaryBody(baseTitle: string, text: string, topics: readonly Topic[]): string {
  const topicLinks = topics.slice(0, 6).map((topic) => `[[${topic.title}]]`).join(", ");
  return [
    `# ${baseTitle} Summary`,
    "",
    truncate(text.replace(/\s+/g, " "), 700),
    "",
    "## Derived Nodes",
    "",
    topicLinks ? `This source produced ${topicLinks}.` : "This source produced derived concept notes."
  ].join("\n");
}

function renderTopicBody(topic: Topic, baseTitle: string): string {
  return [
    `# ${topic.title}`,
    "",
    `Derived from [[${baseTitle} Summary]].`,
    "",
    "## Evidence",
    "",
    truncate(topic.evidence.replace(/\s+/g, " "), 350)
  ].join("\n");
}

function titleFromUri(uri: string): string {
  const withoutQuery = uri.split(/[?#]/)[0] ?? uri;
  const last = withoutQuery.split(/[\\/]/).filter(Boolean).at(-1) ?? "Ingested Source";
  const base = last.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
  return titleCase(base || "Ingested Source");
}

function stripIngestVerb(input: string): string {
  return input.trim().replace(/^\/?ingest\b/i, "").replace(/(?:^|\s)(?:path|url):\S+/g, "").trim();
}

function mimeFromUri(uri: string): string {
  const normalized = uri.toLowerCase();
  if (normalized.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (normalized.endsWith(".html") || normalized.startsWith("http")) {
    return "text/html";
  }
  if (normalized.endsWith(".png")) {
    return "image/png";
  }
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  return "text/markdown";
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)
    .join(" ");
}

function hashString(value: string): string {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trimEnd()}...`;
}

const stopWords = new Set([
  "and",
  "are",
  "for",
  "from",
  "into",
  "the",
  "this",
  "that",
  "with",
  "wiki",
  "source",
  "document"
]);
