import { describe, expect, it } from "vitest";
import { askPatchSchema, draftPatchSchema, improvePatchSchema } from "./agent.js";

describe("DraftPatch schema", () => {
  it("accepts the S-06 draft op set", () => {
    const parsed = draftPatchSchema.parse({
      kind: "Patch",
      outputSchema: "DraftPatch",
      agentId: "draft",
      requiresApproval: true,
      rationale: "Created a starter outline and prose from the prompt.",
      assumptions: ["Audience defaults to a general reader."],
      ops: [
        {
          kind: "insert_section_tree",
          docId: "doc-1",
          position: "document_start",
          sections: [
            { heading: "Context", level: 2 },
            { heading: "Next Steps", level: 2 }
          ]
        },
        {
          kind: "append_paragraph",
          docId: "doc-1",
          sectionHeading: "Context",
          text: "This draft frames the topic and gives the user a concrete starting point."
        }
      ]
    });

    expect(parsed.ops.map((op) => op.kind)).toEqual(["insert_section_tree", "append_paragraph"]);
  });

  it("rejects inverted selection ranges", () => {
    expect(() =>
      draftPatchSchema.parse({
        kind: "Patch",
        rationale: "Expanded the selection.",
        ops: [{ kind: "replace_range", docId: "doc-1", from: 9, to: 3, text: "expanded text" }]
      })
    ).toThrow("replace_range.from must be less than or equal to replace_range.to");
  });
});

describe("S-08 agent schemas", () => {
  it("accepts exactly three ImprovePatch alternatives with readability scores", () => {
    const parsed = improvePatchSchema.parse({
      kind: "Patch",
      outputSchema: "ImprovePatch",
      agentId: "improve",
      requiresApproval: true,
      rationale: "Three alternatives preserve meaning.",
      ops: [
        {
          kind: "replace_range",
          alternativeId: "conservative",
          label: "Conservative cleanup",
          docId: "doc-1",
          from: 0,
          to: 12,
          text: "Clear text."
        },
        {
          kind: "replace_range",
          alternativeId: "tonal",
          label: "Tone-focused rewrite",
          docId: "doc-1",
          from: 0,
          to: 12,
          text: "Key point: clear text."
        },
        {
          kind: "replace_range",
          alternativeId: "concise",
          label: "Concise rewrite",
          docId: "doc-1",
          from: 0,
          to: 12,
          text: "Clear."
        }
      ],
      readabilityScores: {
        conservative: { sentences: 1, words: 2, fkGrade: 1.2 },
        tonal: { sentences: 1, words: 4, fkGrade: 2.1 },
        concise: { sentences: 1, words: 1, fkGrade: 0.4 }
      }
    });

    expect(parsed.ops.map((op) => op.alternativeId)).toEqual(["conservative", "tonal", "concise"]);
  });

  it("rejects ImprovePatch output with duplicate alternatives", () => {
    expect(() =>
      improvePatchSchema.parse({
        kind: "Patch",
        rationale: "Duplicates are invalid.",
        ops: [
          {
            kind: "replace_range",
            alternativeId: "conservative",
            label: "First",
            docId: "doc-1",
            from: 0,
            to: 4,
            text: "One."
          },
          {
            kind: "replace_range",
            alternativeId: "conservative",
            label: "Second",
            docId: "doc-1",
            from: 0,
            to: 4,
            text: "Two."
          },
          {
            kind: "replace_range",
            alternativeId: "concise",
            label: "Third",
            docId: "doc-1",
            from: 0,
            to: 4,
            text: "Three."
          }
        ],
        readabilityScores: {
          conservative: { sentences: 1, words: 1, fkGrade: 1 },
          tonal: { sentences: 1, words: 1, fkGrade: 1 },
          concise: { sentences: 1, words: 1, fkGrade: 1 }
        }
      })
    ).toThrow("ImprovePatch must include exactly one conservative, tonal, and concise alternative");
  });

  it("rejects ImprovePatch output with missing readability scores", () => {
    expect(() =>
      improvePatchSchema.parse({
        kind: "Patch",
        rationale: "Missing score.",
        ops: [
          {
            kind: "replace_range",
            alternativeId: "conservative",
            label: "Conservative",
            docId: "doc-1",
            from: 0,
            to: 4,
            text: "One."
          },
          {
            kind: "replace_range",
            alternativeId: "tonal",
            label: "Tonal",
            docId: "doc-1",
            from: 0,
            to: 4,
            text: "Two."
          },
          {
            kind: "replace_range",
            alternativeId: "concise",
            label: "Concise",
            docId: "doc-1",
            from: 0,
            to: 4,
            text: "Three."
          }
        ],
        readabilityScores: {
          conservative: { sentences: 1, words: 1, fkGrade: 1 },
          concise: { sentences: 1, words: 1, fkGrade: 1 }
        }
      })
    ).toThrow("Required");
  });

  it("accepts AskAgent output that stores a qa page with sources", () => {
    const parsed = askPatchSchema.parse({
      kind: "Patch",
      outputSchema: "AskAnswerPatch",
      agentId: "ask",
      requiresApproval: true,
      rationale: "Stored answer for reuse.",
      answer: {
        answerMd: "Use [[Policy]] as the source.",
        confidence: 0.82,
        sources: [{ docId: "doc-1", title: "Policy", snippet: "The source text.", score: 0.9 }]
      },
      ops: [
        {
          kind: "create_doc",
          path: "wiki/qa/policy.md",
          title: "Policy",
          docKind: "qa",
          body: "# Policy\n\nUse [[Policy]] as the source.",
          frontmatter: {
            kind: "qa",
            question: "Policy?",
            sources: ["doc-1"],
            confidence: 0.82
          }
        }
      ]
    });

    expect(parsed.ops[0]?.docKind).toBe("qa");
    expect(parsed.answer.sources[0]?.docId).toBe("doc-1");
  });

  it("rejects AskAgent create_doc ops for non-qa documents", () => {
    expect(() =>
      askPatchSchema.parse({
        kind: "Patch",
        rationale: "Wrong kind.",
        answer: {
          answerMd: "Answer",
          confidence: 0.5,
          sources: [{ docId: "doc-1", title: "Policy", snippet: "Source" }]
        },
        ops: [
          {
            kind: "create_doc",
            path: "wiki/concepts/policy.md",
            title: "Policy",
            docKind: "concept",
            body: "Answer",
            frontmatter: {
              kind: "qa",
              question: "Policy?",
              sources: ["doc-1"],
              confidence: 0.5
            }
          }
        ]
      })
    ).toThrow("Invalid literal value");
  });

  it("rejects AskAgent qa pages without provenance frontmatter", () => {
    expect(() =>
      askPatchSchema.parse({
        kind: "Patch",
        rationale: "Missing provenance.",
        answer: {
          answerMd: "Answer",
          confidence: 0.5,
          sources: [{ docId: "doc-1", title: "Policy", snippet: "Source" }]
        },
        ops: [
          {
            kind: "create_doc",
            path: "wiki/qa/policy.md",
            title: "Policy",
            docKind: "qa",
            body: "Answer"
          }
        ]
      })
    ).toThrow("Required");
  });
});
