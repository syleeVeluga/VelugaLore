import type { EditorContext, SlashArgValue, SlashInvocation, SlashTarget } from "./types.js";

export type SlashParseErrorCode =
  | "empty"
  | "missing_slash"
  | "missing_verb"
  | "invalid_verb"
  | "unterminated_quote"
  | "missing_arg_name"
  | "missing_arg_value";

export class SlashParseError extends Error {
  readonly code: SlashParseErrorCode;

  constructor(code: SlashParseErrorCode, message: string) {
    super(message);
    this.name = "SlashParseError";
    this.code = code;
  }
}

type Token = {
  value: string;
  quoted: boolean;
};

const verbPattern = /^[a-z][a-z0-9_-]*$/i;
const keyedTokenPattern = /^([A-Za-z][A-Za-z0-9_-]*):(.*)$/;
const queryVerbs = new Set(["ask", "find", "grep"]);

export function parseSlash(input: string, ctx: EditorContext): SlashInvocation {
  const raw = input;
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new SlashParseError("empty", "Slash command is empty.");
  }

  if (!trimmed.startsWith("/")) {
    throw new SlashParseError("missing_slash", "Slash command must start with '/'.");
  }

  const commandText = trimmed.slice(1).trim();
  if (commandText.length === 0) {
    throw new SlashParseError("missing_verb", "Slash command is missing a verb.");
  }

  const [verbToken, ...tokens] = tokenize(commandText);
  const verb = verbToken?.value.toLowerCase();
  if (!verb) {
    throw new SlashParseError("missing_verb", "Slash command is missing a verb.");
  }

  if (!verbPattern.test(verb)) {
    throw new SlashParseError("invalid_verb", `Invalid slash command verb: ${verb}`);
  }

  const args: Record<string, SlashArgValue> = {};
  const freeTextTokens: string[] = [];
  let target = selectionTarget(ctx);

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const value = token.value;

    if (value === "--") {
      const tail = tokens.slice(index + 1).map((item) => item.value);
      freeTextTokens.push(...tail);
      break;
    }

    if (value.startsWith("--")) {
      const parsed = parseFlag(value);
      const flagName = parsed.name;
      if (!flagName) {
        throw new SlashParseError("missing_arg_name", "Slash argument is missing a name.");
      }

      if (parsed.value !== undefined) {
        args[flagName] = coerceArgValue(parsed.value);
        continue;
      }

      const next = tokens[index + 1];
      if (!next || next.value.startsWith("--")) {
        args[flagName] = true;
        continue;
      }

      args[flagName] = coerceArgValue(next.value);
      index += 1;
      continue;
    }

    const keyed = keyedTokenPattern.exec(value);
    if (keyed && !token.quoted) {
      const [, key, rawValue] = keyed;
      if (rawValue.length === 0) {
        throw new SlashParseError("missing_arg_value", `Slash argument '${key}' is missing a value.`);
      }

      if (key === "path") {
        target = { kind: "path", path: rawValue };
      } else if (key === "doc") {
        target = { kind: "doc", docId: rawValue };
      } else if (key === "query") {
        target = { kind: "query", query: rawValue };
      }

      args[key] = coerceArgValue(rawValue);
      continue;
    }

    freeTextTokens.push(value);
  }

  if (!target && queryVerbs.has(verb) && freeTextTokens.length > 0) {
    target = { kind: "query", query: freeTextTokens.join(" ") };
  }

  return {
    verb,
    target,
    args,
    freeText: freeTextTokens.length > 0 ? freeTextTokens.join(" ") : undefined,
    raw
  };
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let current = "";
  let quote: "'" | "\"" | null = null;
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (quote) {
      if (char === "\\") {
        const next = input[index + 1];
        if (next) {
          current += next;
          index += 1;
          continue;
        }
      }

      if (char === quote) {
        quote = null;
        continue;
      }

      current += char;
      continue;
    }

    if (char === "'" || char === "\"") {
      quote = char;
      quoted = true;
      continue;
    }

    if (/\s/.test(char)) {
      if (current.length > 0 || quoted) {
        tokens.push({ value: current, quoted });
        current = "";
        quoted = false;
      }
      continue;
    }

    current += char;
  }

  if (quote) {
    throw new SlashParseError("unterminated_quote", "Slash command contains an unterminated quote.");
  }

  if (current.length > 0 || quoted) {
    tokens.push({ value: current, quoted });
  }

  return tokens;
}

function parseFlag(token: string): { name: string; value?: string } {
  const body = token.slice(2);
  const equalsIndex = body.indexOf("=");
  if (equalsIndex === -1) {
    return { name: body };
  }

  return {
    name: body.slice(0, equalsIndex),
    value: body.slice(equalsIndex + 1)
  };
}

function coerceArgValue(value: string): SlashArgValue {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return value;
}

function selectionTarget(ctx: EditorContext): SlashTarget | undefined {
  const selection = ctx.selection;
  if (!selection || selection.from === selection.to) {
    return undefined;
  }

  return {
    kind: "selection",
    docId: selection.docId,
    from: selection.from,
    to: selection.to
  };
}
