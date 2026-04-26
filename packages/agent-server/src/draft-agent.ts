import {
  draftPatchSchema,
  parseSlash,
  type AgentRunInvocation,
  type DraftPatch,
  type EditorSelectionContext,
  type SlashArg
} from "@weki/core";

type DraftSection = {
  heading: string;
  angle: string;
};

const defaultSections: DraftSection[] = [
  { heading: "Context", angle: "why this page matters and what problem it addresses" },
  { heading: "Goals", angle: "the outcomes the reader should understand or act on" },
  { heading: "Approach", angle: "the practical path, constraints, and operating principles" },
  { heading: "Details", angle: "the concrete points that turn the idea into usable work" },
  { heading: "Next Steps", angle: "the decisions, owners, or follow-up work needed next" }
];

export function runDraftAgent(invocation: AgentRunInvocation): DraftPatch {
  const docId = invocation.context?.docId ?? invocation.context?.selection?.docId ?? "current-doc";
  const body = invocation.context?.body ?? "";
  const slash = parseDraftInvocation(invocation, docId);
  const prompt = slash.freeText || stripDraftVerb(invocation.input) || "the current page";
  const audience = slash.audience ?? "general readers";
  const selection = resolveSelection(invocation, docId);

  if (selection) {
    return draftPatchSchema.parse({
      kind: "Patch",
      outputSchema: "DraftPatch",
      agentId: "draft",
      requiresApproval: true,
      rationale: `Expanded the selected passage for ${audience} using the available document context.`,
      assumptions: [`Audience interpreted as ${audience}.`],
      ops: [
        {
          kind: "replace_range",
          docId: selection.docId,
          from: selection.from,
          to: selection.to,
          text: expandSelection(selection.text, prompt, audience)
        }
      ]
    });
  }

  if (body.trim().length === 0) {
    return draftPatchSchema.parse({
      kind: "Patch",
      outputSchema: "DraftPatch",
      agentId: "draft",
      requiresApproval: true,
      rationale: `Created a five-section outline and first-pass draft for ${audience}.`,
      assumptions: [`Topic interpreted as ${prompt}.`, `Audience interpreted as ${audience}.`],
      ops: [
        {
          kind: "insert_section_tree",
          docId,
          position: "document_start",
          sections: defaultSections.map((section) => ({ heading: section.heading, level: 2 }))
        },
        ...defaultSections.map((section) => ({
          kind: "append_paragraph" as const,
          docId,
          sectionHeading: section.heading,
          text: paragraphForSection(section, prompt, audience)
        }))
      ]
    });
  }

  return draftPatchSchema.parse({
    kind: "Patch",
    outputSchema: "DraftPatch",
    agentId: "draft",
    requiresApproval: true,
    rationale: `Appended a focused draft paragraph for ${audience}.`,
    assumptions: [`Topic interpreted as ${prompt}.`, `Existing document body was preserved.`],
    ops: [
      {
        kind: "append_paragraph",
        docId,
        sectionHeading: "Draft",
        text: paragraphForSection(defaultSections[2], prompt, audience)
      }
    ]
  });
}

function parseDraftInvocation(
  invocation: AgentRunInvocation,
  docId: string
): { freeText?: string; audience?: string } {
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
    const parsed = parseSlash(invocation.input.startsWith("/") ? invocation.input : `/draft ${invocation.input}`.trim(), {
      docId,
      selection: editorSelection
    });
    return {
      freeText: parsed.freeText,
      audience: argToString(parsed.args.audience)
    };
  } catch {
    return { freeText: stripDraftVerb(invocation.input) };
  }
}

function argToString(value: SlashArg | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== "string") {
    return undefined;
  }
  return first;
}

function stripDraftVerb(input: string): string {
  return input.trim().replace(/^\/?draft\b/i, "").trim();
}

function resolveSelection(
  invocation: AgentRunInvocation,
  fallbackDocId: string
): { docId: string; from: number; to: number; text: string } | undefined {
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

function paragraphForSection(section: DraftSection, prompt: string, audience: string): string {
  return `For ${audience}, this section should explain ${section.angle} for ${prompt}. It should stay concrete, name the important tradeoffs, and give the reader enough detail to continue editing without needing a separate planning pass.`;
}

function expandSelection(selectionText: string, prompt: string, audience: string): string {
  const compact = selectionText.trim();
  return `${compact}\n\nFor ${audience}, expand this into a clearer draft by adding the purpose, the practical implications, and the next decision the reader should make. Keep the original intent intact while making the ${prompt} angle explicit.`;
}
