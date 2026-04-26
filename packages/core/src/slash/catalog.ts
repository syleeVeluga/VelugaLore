import type { SlashCommandDefinition } from "./types.js";

const toneValues = [
  { value: "executive", labelKey: "slash.arg.value.tone.executive" },
  { value: "casual", labelKey: "slash.arg.value.tone.casual" },
  { value: "formal", labelKey: "slash.arg.value.tone.formal" },
  { value: "legal", labelKey: "slash.arg.value.tone.legal" }
] as const;

export const slashCommandCatalog = [
  {
    verb: "draft",
    group: "core",
    agent: "draft",
    summaryKey: "slash.draft.summary",
    examples: [
      { input: "/draft", labelKey: "slash.draft.example.empty" },
      { input: "/draft R&D proposal in five bullets --audience executives", labelKey: "slash.draft.example.prompt" }
    ],
    args: [{ name: "audience", labelKey: "slash.arg.audience" }],
    selection: "optional",
    multiDoc: false,
    defaultApplyMode: "dry-run preview"
  },
  {
    verb: "improve",
    group: "core",
    agent: "improve",
    summaryKey: "slash.improve.summary",
    examples: [
      { input: "/improve", labelKey: "slash.improve.example.selection" },
      { input: "/improve --tone executive --maxWords 120", labelKey: "slash.improve.example.tone" }
    ],
    args: [
      { name: "tone", labelKey: "slash.arg.tone", values: toneValues },
      { name: "maxWords", labelKey: "slash.arg.maxWords" }
    ],
    selection: "required",
    multiDoc: false,
    defaultApplyMode: "preview-3-options"
  },
  {
    verb: "ask",
    group: "core",
    agent: "ask",
    summaryKey: "slash.ask.summary",
    examples: [
      { input: "/ask Which five pages are most related to onboarding?", labelKey: "slash.ask.example.query" }
    ],
    selection: "none",
    multiDoc: true,
    defaultApplyMode: "append-as-new-doc"
  },
  {
    verb: "ingest",
    group: "core",
    agent: "ingest",
    summaryKey: "slash.ingest.summary",
    examples: [{ input: "/ingest path:./inbox/2026-04-arxiv.pdf", labelKey: "slash.ingest.example.path" }],
    selection: "none",
    multiDoc: false,
    defaultApplyMode: "confirm-then-apply"
  },
  {
    verb: "curate",
    group: "core",
    agent: "curate",
    summaryKey: "slash.curate.summary",
    examples: [
      { input: "/curate scope:wiki/policies", labelKey: "slash.curate.example.scope" },
      { input: "/curate --since 7d --threshold 30", labelKey: "slash.curate.example.since" }
    ],
    args: [
      { name: "since", labelKey: "slash.arg.since" },
      { name: "threshold", labelKey: "slash.arg.threshold" }
    ],
    selection: "none",
    multiDoc: true,
    defaultApplyMode: "preview-then-approval"
  },
  {
    verb: "import",
    group: "system",
    summaryKey: "slash.import.summary",
    examples: [
      {
        input: "/import path:./onboarding.zip --target wiki/policies --preserve-tree --remap-links",
        labelKey: "slash.import.example.zip"
      }
    ],
    args: [
      { name: "target", labelKey: "slash.arg.target" },
      { name: "preserve-tree", labelKey: "slash.arg.preserveTree" },
      { name: "remap-links", labelKey: "slash.arg.remapLinks" }
    ],
    selection: "none",
    multiDoc: true,
    defaultApplyMode: "confirm-then-apply"
  },
  {
    verb: "find",
    group: "system",
    summaryKey: "slash.find.summary",
    examples: [{ input: "/find exact phrase --mode literal --topk 10", labelKey: "slash.find.example.literal" }],
    args: [
      { name: "mode", labelKey: "slash.arg.mode" },
      { name: "topk", labelKey: "slash.arg.topk" },
      { name: "kind", labelKey: "slash.arg.kind" },
      { name: "since", labelKey: "slash.arg.since" }
    ],
    selection: "none",
    multiDoc: true,
    defaultApplyMode: "ranked panel"
  },
  {
    verb: "grep",
    group: "system",
    summaryKey: "slash.grep.summary",
    examples: [{ input: "/grep '\\[\\[[^\\]]*\\]\\]' --output content", labelKey: "slash.grep.example.links" }],
    args: [
      { name: "output", labelKey: "slash.arg.output" },
      { name: "context", labelKey: "slash.arg.context" },
      { name: "kind", labelKey: "slash.arg.kind" }
    ],
    selection: "none",
    multiDoc: true,
    defaultApplyMode: "report only"
  },
  {
    verb: "compare",
    group: "system",
    summaryKey: "slash.compare.summary",
    examples: [{ input: "/compare doc:policy-2025 doc:policy-2026 --mode prose", labelKey: "slash.compare.example.docs" }],
    selection: "none",
    multiDoc: false,
    defaultApplyMode: "side-by-side diff"
  },
  {
    verb: "duplicates",
    group: "system",
    summaryKey: "slash.duplicates.summary",
    examples: [{ input: "/duplicates scope:wiki/inbox --threshold 0.9", labelKey: "slash.duplicates.example.scope" }],
    selection: "none",
    multiDoc: true,
    defaultApplyMode: "grouped report"
  },
  {
    verb: "cluster",
    group: "system",
    summaryKey: "slash.cluster.summary",
    examples: [{ input: "/cluster scope:wiki/policies --k auto", labelKey: "slash.cluster.example.scope" }],
    selection: "none",
    multiDoc: true,
    defaultApplyMode: "clusters report"
  },
  {
    verb: "diff",
    group: "system",
    summaryKey: "slash.diff.summary",
    examples: [{ input: "/diff doc:policy --rev 12 --rev 17", labelKey: "slash.diff.example.rev" }],
    selection: "none",
    multiDoc: false,
    defaultApplyMode: "report only"
  },
  {
    verb: "blame",
    group: "system",
    summaryKey: "slash.blame.summary",
    examples: [{ input: "/blame range:42:118", labelKey: "slash.blame.example.range" }],
    selection: "required",
    multiDoc: false,
    defaultApplyMode: "report only"
  },
  {
    verb: "revert",
    group: "system",
    summaryKey: "slash.revert.summary",
    examples: [{ input: "/revert run:9b14", labelKey: "slash.revert.example.run" }],
    selection: "none",
    multiDoc: true,
    defaultApplyMode: "confirm-then-apply"
  },
  {
    verb: "lint",
    group: "system",
    summaryKey: "slash.lint.summary",
    examples: [{ input: "/lint scope:wiki/policies", labelKey: "slash.lint.example.scope" }],
    selection: "none",
    multiDoc: true,
    defaultApplyMode: "report only"
  },
  {
    verb: "compile",
    group: "system",
    summaryKey: "slash.compile.summary",
    examples: [{ input: "/compile --since 24h", labelKey: "slash.compile.example.since" }],
    selection: "none",
    multiDoc: true,
    defaultApplyMode: "scheduled or manual"
  },
  {
    verb: "plan",
    group: "ext",
    summaryKey: "slash.plan.summary",
    examples: [{ input: "/plan selected section", labelKey: "slash.plan.example.selection" }],
    selection: "optional",
    multiDoc: false,
    defaultApplyMode: "dry-run preview"
  },
  {
    verb: "expand",
    group: "ext",
    summaryKey: "slash.expand.summary",
    examples: [{ input: "/expand", labelKey: "slash.expand.example.selection" }],
    selection: "required",
    multiDoc: false,
    defaultApplyMode: "preview"
  },
  {
    verb: "simplify",
    group: "ext",
    summaryKey: "slash.simplify.summary",
    examples: [{ input: "/simplify --tone executive", labelKey: "slash.simplify.example.tone" }],
    selection: "required",
    multiDoc: false,
    defaultApplyMode: "preview-3-options"
  },
  {
    verb: "crosslink",
    group: "ext",
    summaryKey: "slash.crosslink.summary",
    examples: [{ input: "/crosslink", labelKey: "slash.crosslink.example.doc" }],
    selection: "none",
    multiDoc: false,
    defaultApplyMode: "inline-suggest"
  },
  {
    verb: "review",
    group: "ext",
    summaryKey: "slash.review.summary",
    examples: [{ input: "/review --scope doc", labelKey: "slash.review.example.doc" }],
    selection: "none",
    multiDoc: true,
    defaultApplyMode: "report only"
  },
  {
    verb: "summarize",
    group: "ext",
    summaryKey: "slash.summarize.summary",
    examples: [{ input: "/summarize doc:meeting-notes", labelKey: "slash.summarize.example.doc" }],
    selection: "none",
    multiDoc: true,
    defaultApplyMode: "confirm"
  },
  {
    verb: "outline",
    group: "ext",
    summaryKey: "slash.outline.summary",
    examples: [{ input: "/outline", labelKey: "slash.outline.example.doc" }],
    selection: "none",
    multiDoc: false,
    defaultApplyMode: "apply"
  },
  {
    verb: "translate",
    group: "ext",
    summaryKey: "slash.translate.summary",
    examples: [{ input: "/translate --to ko", labelKey: "slash.translate.example.to" }],
    selection: "required",
    multiDoc: false,
    defaultApplyMode: "preview"
  },
  {
    verb: "cite",
    group: "ext",
    summaryKey: "slash.cite.summary",
    examples: [{ input: "/cite", labelKey: "slash.cite.example.selection" }],
    selection: "required",
    multiDoc: false,
    defaultApplyMode: "preview"
  },
  {
    verb: "slides",
    group: "ext",
    summaryKey: "slash.slides.summary",
    examples: [{ input: "/slides --format deck", labelKey: "slash.slides.example.deck" }],
    selection: "none",
    multiDoc: false,
    defaultApplyMode: "confirm"
  },
  {
    verb: "diagram",
    group: "ext",
    summaryKey: "slash.diagram.summary",
    examples: [{ input: "/diagram", labelKey: "slash.diagram.example.doc" }],
    selection: "optional",
    multiDoc: false,
    defaultApplyMode: "preview"
  },
  {
    verb: "refactor",
    group: "ext",
    summaryKey: "slash.refactor.summary",
    examples: [{ input: "/refactor resource -> asset --scope wiki/policies --preview", labelKey: "slash.refactor.example.scope" }],
    selection: "optional",
    multiDoc: true,
    defaultApplyMode: "preview-multi-doc then confirm"
  }
] as const satisfies readonly SlashCommandDefinition[];

export type SlashCommandVerb = (typeof slashCommandCatalog)[number]["verb"];

export const slashCommandByVerb: ReadonlyMap<string, SlashCommandDefinition> = new Map<string, SlashCommandDefinition>(
  slashCommandCatalog.map((command) => [command.verb, command])
);

export function getSlashCommand(verb: string): SlashCommandDefinition | undefined {
  return slashCommandByVerb.get(verb);
}
