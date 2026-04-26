import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import {
  getSlashCommand,
  slashCommandCatalog,
  type SlashCommandDefinition,
  type SlashInvocation
} from "@weki/core";

export type Translate = (key: string) => string;

export interface SlashMenuExampleView {
  input: string;
  label: string;
}

export interface SlashMenuItemView {
  label: string;
  detail: string;
  help: string;
  command: SlashCommandDefinition;
  examples: SlashMenuExampleView[];
}

export interface SlashInvocationView {
  title: string;
  summary: string;
  target?: string;
  freeText?: string;
  args: readonly string[];
  examples: readonly SlashMenuExampleView[];
}

export interface WekiSlashMenuOptions {
  translate?: Translate;
}

const identityTranslate: Translate = (key) => key;

export function renderSlashMenuItems(query = "", translate: Translate = identityTranslate): SlashMenuItemView[] {
  const normalized = query.replace(/^\//, "").toLowerCase();

  return slashCommandCatalog
    .filter((command) => command.verb.startsWith(normalized))
    .map((command) => {
      const examples = command.examples.map((example) => ({
        input: example.input,
        label: translate(example.labelKey)
      }));

      return {
        label: `/${command.verb}`,
        detail: `${translate(`slash.command.group.${command.group}`)} - ${translate(command.summaryKey)}`,
        help: examples.map((example) => `${example.input} - ${example.label}`).join("\n"),
        command,
        examples
      };
    });
}

export function renderSlashInvocation(invocation: SlashInvocation, translate: Translate = identityTranslate): SlashInvocationView {
  const command = getSlashCommand(invocation.verb);
  const args = Object.entries(invocation.args).map(([key, value]) => `--${key} ${String(value)}`);

  return {
    title: `/${invocation.verb}`,
    summary: command ? translate(command.summaryKey) : invocation.verb,
    target: invocation.target ? renderTarget(invocation.target) : undefined,
    freeText: invocation.freeText,
    args,
    examples:
      command?.examples.map((example) => ({
        input: example.input,
        label: translate(example.labelKey)
      })) ?? []
  };
}

export function wekiSlashMenu(options: WekiSlashMenuOptions = {}): Extension {
  const translate = options.translate ?? identityTranslate;

  return autocompletion({
    override: [(context) => slashCompletionSource(context, translate)]
  });
}

export function slashCompletionSource(context: CompletionContext, translate: Translate = identityTranslate): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const beforeCursor = context.state.sliceDoc(line.from, context.pos);
  const match = /(?:^|\s)(\/[A-Za-z0-9_-]*)$/.exec(beforeCursor);

  if (!match) {
    return null;
  }

  const token = match[1];
  const from = context.pos - token.length;
  const options = renderSlashMenuItems(token, translate).map(toCompletion);

  return {
    from,
    options,
    validFor: /^\/[A-Za-z0-9_-]*$/
  };
}

function toCompletion(item: SlashMenuItemView): Completion {
  return {
    label: item.label,
    type: "keyword",
    detail: item.detail,
    info: item.help,
    apply: item.label
  };
}

function renderTarget(target: SlashInvocation["target"]): string {
  if (!target) {
    return "";
  }

  switch (target.kind) {
    case "selection":
      return `selection:${target.docId}:${target.from}:${target.to}`;
    case "doc":
      return `doc:${target.docId}`;
    case "path":
      return `path:${target.path}`;
    case "query":
      return `query:${target.query}`;
  }

  return "";
}
