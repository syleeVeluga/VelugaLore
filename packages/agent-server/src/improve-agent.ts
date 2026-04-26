import {
  improvePatchSchema,
  parseSlash,
  type AgentRunInvocation,
  type EditorSelectionContext,
  type ImproveAlternativeId,
  type ImprovePatch,
  type SlashArg
} from "@weki/core";

type ResolvedSelection = {
  docId: string;
  from: number;
  to: number;
  text: string;
};

const alternativeLabels: Record<ImproveAlternativeId, string> = {
  conservative: "Conservative cleanup",
  tonal: "Tone-focused rewrite",
  concise: "Concise rewrite"
};

export function runImproveAgent(invocation: AgentRunInvocation): ImprovePatch {
  const docId = invocation.context?.docId ?? invocation.context?.selection?.docId ?? "current-doc";
  const selection = resolveSelection(invocation, docId);
  if (!selection) {
    throw new Error("IMPROVE_REQUIRES_SELECTION");
  }

  const options = parseImproveInvocation(invocation, docId);
  const alternatives = {
    conservative: fitMaxWords(conservativeRewrite(selection.text), options.maxWords),
    tonal: fitMaxWords(tonalRewrite(selection.text, options.tone), options.maxWords),
    concise: fitMaxWords(conciseRewrite(selection.text), options.maxWords)
  } satisfies Record<ImproveAlternativeId, string>;

  return improvePatchSchema.parse({
    kind: "Patch",
    outputSchema: "ImprovePatch",
    agentId: "improve",
    requiresApproval: true,
    rationale: [
      "conservative: cleaned grammar and flow while preserving wording.",
      `tonal: emphasized ${options.tone} tone without adding claims.`,
      "concise: reduced filler and kept the original meaning."
    ].join(" "),
    ops: (Object.entries(alternatives) as Array<[ImproveAlternativeId, string]>).map(([alternativeId, text]) => ({
      kind: "replace_range",
      alternativeId,
      label: alternativeLabels[alternativeId],
      docId: selection.docId,
      from: selection.from,
      to: selection.to,
      text
    })),
    readabilityScores: Object.fromEntries(
      (Object.entries(alternatives) as Array<[ImproveAlternativeId, string]>).map(([alternativeId, text]) => [
        alternativeId,
        readabilityScore(text)
      ])
    )
  });
}

function parseImproveInvocation(
  invocation: AgentRunInvocation,
  docId: string
): { tone: string; maxWords?: number } {
  const selection = invocation.context?.selection;
  const editorSelection: EditorSelectionContext | null = selection
    ? {
        docId: selection.docId ?? docId,
        from: selection.from,
        to: selection.to,
        text: selection.text
      }
    : null;

  try {
    const parsed = parseSlash(invocation.input.startsWith("/") ? invocation.input : `/improve ${invocation.input}`.trim(), {
      docId,
      selection: editorSelection
    });
    return {
      tone: argToString(parsed.args.tone) ?? "formal",
      maxWords: argToNumber(parsed.args.maxWords)
    };
  } catch {
    return { tone: "formal" };
  }
}

function argToString(value: SlashArg | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" ? first : undefined;
}

function argToNumber(value: SlashArg | undefined): number | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first === "number") {
    return first;
  }
  if (typeof first === "string" && /^\d+$/.test(first)) {
    return Number.parseInt(first, 10);
  }
  return undefined;
}

function resolveSelection(invocation: AgentRunInvocation, fallbackDocId: string): ResolvedSelection | undefined {
  const selection = invocation.context?.selection;
  if (!selection || selection.from === selection.to) {
    return undefined;
  }

  const text = selection.text ?? invocation.context?.body?.slice(selection.from, selection.to) ?? "";
  if (text.trim().length === 0) {
    return undefined;
  }

  return {
    docId: selection.docId ?? fallbackDocId,
    from: selection.from,
    to: selection.to,
    text
  };
}

function conservativeRewrite(text: string): string {
  return ensureTerminalPunctuation(normalizeWhitespace(text));
}

function tonalRewrite(text: string, tone: string): string {
  const normalized = normalizeWhitespace(text);
  const prefixByTone: Record<string, string> = {
    casual: "In plain terms, ",
    executive: "Key point: ",
    formal: "In summary, ",
    legal: "For clarity, "
  };
  return ensureTerminalPunctuation(`${prefixByTone[tone] ?? prefixByTone.formal}${lowercaseFirst(normalized)}`);
}

function conciseRewrite(text: string): string {
  const withoutFillers = normalizeWhitespace(text)
    .replace(/\b(really|very|basically|actually|simply|clearly)\b/gi, "")
    .replace(/\b(it is important to note that|please note that)\b/gi, "")
    .replace(/\s+,/g, ",");
  return ensureTerminalPunctuation(normalizeWhitespace(withoutFillers));
}

function fitMaxWords(text: string, maxWords: number | undefined): string {
  if (!maxWords || maxWords <= 0) {
    return text;
  }
  const words = text.split(/\s+/).filter(Boolean);
  return words.length <= maxWords ? text : ensureTerminalPunctuation(words.slice(0, maxWords).join(" "));
}

function readabilityScore(text: string): { sentences: number; words: number; fkGrade: number } {
  const sentences = Math.max(1, (text.match(/[.!?]+/g) ?? []).length);
  const words = text.split(/\s+/).filter(Boolean);
  const syllables = Math.max(1, words.reduce((sum, word) => sum + countSyllables(word), 0));
  const fkGrade = Number((0.39 * (words.length / sentences) + 11.8 * (syllables / Math.max(1, words.length)) - 15.59).toFixed(2));
  return { sentences, words: words.length, fkGrade };
}

function countSyllables(word: string): number {
  const normalized = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!normalized) {
    return 1;
  }
  const groups = normalized.match(/[aeiouy]+/g)?.length ?? 1;
  return Math.max(1, groups - (normalized.endsWith("e") ? 1 : 0));
}

function normalizeWhitespace(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function ensureTerminalPunctuation(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function lowercaseFirst(text: string): string {
  return text.length === 0 ? text : `${text[0].toLowerCase()}${text.slice(1)}`;
}
