import { askPatchSchema, parseSlash, type AgentRunInvocation, type AskPatch, type AskSource } from "@weki/core";

type SearchDocument = {
  docId: string;
  title: string;
  path?: string;
  body: string;
};

export function runAskAgent(invocation: AgentRunInvocation): AskPatch {
  const query = parseAskQuery(invocation);
  const documents = collectDocuments(invocation);
  const sources = searchWorkspace(query, documents);

  if (sources.length === 0) {
    throw new Error("ASK_REQUIRES_SOURCES");
  }

  const confidence = confidenceForSources(sources);
  const answerMd = renderAnswer(query, sources, confidence);
  const title = summarizeQuestion(query);
  const body = renderQaBody(query, answerMd, sources, confidence);

  return askPatchSchema.parse({
    kind: "Patch",
    outputSchema: "AskAnswerPatch",
    agentId: "ask",
    requiresApproval: true,
    rationale: `Answered from ${sources.length} workspace source(s) and prepared a kind='qa' page for reuse by later /ask searches.`,
    answer: {
      answerMd,
      sources,
      confidence
    },
    ops: [
      {
        kind: "create_doc",
        path: `wiki/qa/${slugify(title)}.md`,
        title,
        docKind: "qa",
        body,
        frontmatter: {
          kind: "qa",
          question: query,
          sources: sources.map((source) => source.docId),
          confidence
        }
      }
    ]
  });
}

function parseAskQuery(invocation: AgentRunInvocation): string {
  try {
    const parsed = parseSlash(invocation.input.startsWith("/") ? invocation.input : `/ask ${invocation.input}`.trim(), {
      docId: invocation.context?.docId ?? "current-doc",
      selection: null
    });
    return parsed.freeText?.trim() || stripAskVerb(invocation.input) || "current workspace question";
  } catch {
    return stripAskVerb(invocation.input) || "current workspace question";
  }
}

function stripAskVerb(input: string): string {
  return input.trim().replace(/^\/?ask\b/i, "").trim();
}

function collectDocuments(invocation: AgentRunInvocation): SearchDocument[] {
  const fromContext = invocation.context?.documents ?? [];
  const currentBody = invocation.context?.body;
  const currentDocId = invocation.context?.docId;
  const currentTitle = invocation.context?.title ?? currentDocId;
  const currentPath = invocation.context?.path;

  const documents = [...fromContext];
  if (currentBody && currentDocId && !documents.some((document) => document.docId === currentDocId)) {
    documents.push({
      docId: currentDocId,
      title: currentTitle ?? currentDocId,
      path: currentPath,
      body: currentBody
    });
  }
  return documents.filter((document) => document.body.trim().length > 0);
}

function searchWorkspace(query: string, documents: readonly SearchDocument[]): AskSource[] {
  const queryTerms = tokenize(query);
  return documents
    .map((document) => {
      const bodyTerms = tokenize(`${document.title} ${document.body}`);
      const overlap = [...queryTerms].filter((term) => bodyTerms.has(term)).length;
      const score = queryTerms.size === 0 ? 0 : overlap / queryTerms.size;
      return {
        docId: document.docId,
        title: document.title,
        path: document.path,
        snippet: snippetFor(document.body, queryTerms),
        score
      };
    })
    .filter((source) => source.score > 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 5);
}

function renderAnswer(query: string, sources: readonly AskSource[], confidence: number): string {
  const sourceLinks = sources.map((source) => `[[${source.title}]]`).join(", ");
  const strongest = sources[0];
  return [
    `Answering "${query}" from workspace sources: ${sourceLinks}.`,
    strongest ? `The strongest supporting note says: ${strongest.snippet}` : "",
    confidence < 0.6 ? "Confidence is limited because the query only partially matched the available notes." : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}

function renderQaBody(query: string, answerMd: string, sources: readonly AskSource[], confidence: number): string {
  const sourceLines = sources
    .map((source) => `- [[${source.title}]]${source.path ? ` (${source.path})` : ""}: ${source.snippet}`)
    .join("\n");
  return `# ${summarizeQuestion(query)}\n\n${answerMd}\n\n## Sources\n\n${sourceLines}\n\n## Metadata\n\nconfidence: ${confidence.toFixed(2)}\n`;
}

function confidenceForSources(sources: readonly AskSource[]): number {
  const best = sources[0]?.score ?? 0;
  const breadth = Math.min(0.2, sources.length * 0.04);
  return Number(Math.min(0.95, Math.max(0.35, best * 0.75 + breadth)).toFixed(2));
}

function snippetFor(body: string, queryTerms: ReadonlySet<string>): string {
  const sentences = body.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
  const best = sentences
    .map((sentence) => ({
      sentence,
      hits: [...queryTerms].filter((term) => tokenize(sentence).has(term)).length
    }))
    .sort((a, b) => b.hits - a.hits)[0]?.sentence;
  return truncate(best ?? body.trim(), 220);
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}_]+/u)
      .filter((term) => term.length >= 2)
  );
}

function summarizeQuestion(query: string): string {
  return truncate(query.replace(/[?!.]+$/g, "").trim(), 80) || "Workspace question";
}

function slugify(value: string): string {
  const ascii = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii || `qa-${hashString(value)}`;
}

function hashString(value: string): string {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(16);
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trimEnd()}...`;
}
