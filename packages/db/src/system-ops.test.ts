import { describe, expect, it } from "vitest";
import {
  blameRevisionLines,
  diffRevisions,
  grepWorkspace,
  lintWorkspace,
  planRevisionRevert,
  searchWorkspace,
  systemSha256Hex,
  type DocRevision,
  type SystemDocument
} from "./system-ops.js";

const docs: SystemDocument[] = [
  {
    id: "policy",
    path: "wiki/policies/onboarding.md",
    title: "Onboarding Policy",
    kind: "concept",
    body: "The onboarding policy defines approvals for the first week checklist.\nSee [[Security Policy]].",
    tags: ["hr"],
    embedding: [0.99, 0.01, 0]
  },
  {
    id: "security",
    path: "wiki/policies/security.md",
    title: "Security Policy",
    kind: "concept",
    body: "Security access requires manager approval and device enrollment.",
    tags: ["security"],
    embedding: [0.1, 0.98, 0]
  },
  {
    id: "benefits",
    path: "wiki/benefits/leave.md",
    title: "Leave Benefits",
    kind: "concept",
    body: "Annual leave and parental leave rules are documented here.",
    tags: ["hr"],
    embedding: [0, 0.1, 0.95]
  }
];

describe("S-10 system ops", () => {
  it("combines literal, fuzzy, and semantic search with RRF", () => {
    const result = searchWorkspace({
      query: "onboarding approvals",
      queryEmbedding: [1, 0, 0],
      documents: docs,
      topK: 3
    });

    expect(result.hits[0]).toMatchObject({
      docId: "policy",
      ranks: {
        literal: 1,
        semantic: 1
      }
    });
    expect(result.hits[0]?.scoreBreakdown.literal).toBeGreaterThan(0);
    expect(result.hits[0]?.scoreBreakdown.fuzzy).toBeGreaterThan(0);
    expect(result.hits[0]?.scoreBreakdown.semantic).toBeGreaterThan(0.9);
  });

  it("applies path glob and metadata filters before find ranking", () => {
    const result = searchWorkspace({
      query: "leave",
      documents: docs,
      path: "wiki/**/*.md",
      tag: "hr",
      topK: 5,
      mode: "literal"
    });

    expect(result.hits.map((hit) => hit.path)).toEqual(["wiki/benefits/leave.md"]);
  });

  it("supports exact grep output modes, context, whole-word, and invert matches", () => {
    const content = grepWorkspace({
      documents: docs,
      pattern: "\\[\\[[^\\]]*\\]\\]",
      outputMode: "content",
      context: 1
    });

    expect(content).toEqual({
      outputMode: "content",
      hits: [
        {
          docId: "policy",
          path: "wiki/policies/onboarding.md",
          line: 2,
          col: 5,
          match: "[[Security Policy]]",
          before: ["The onboarding policy defines approvals for the first week checklist."],
          after: []
        }
      ]
    });

    const files = grepWorkspace({
      documents: docs,
      pattern: "leave",
      outputMode: "files_with_matches",
      wholeWord: true,
      caseInsensitive: true
    });
    expect(files).toEqual({
      outputMode: "files_with_matches",
      paths: [{ docId: "benefits", path: "wiki/benefits/leave.md", matchCount: 1 }]
    });

    const inverted = grepWorkspace({
      documents: docs.slice(0, 1),
      pattern: "onboarding",
      outputMode: "count",
      invertMatch: true
    });
    expect(inverted).toEqual({
      outputMode: "count",
      totalMatches: 1,
      totalFiles: 1,
      byPath: [{ path: "wiki/policies/onboarding.md", count: 1 }]
    });

    const multilineInverted = grepWorkspace({
      documents: [
        {
          id: "multi",
          path: "wiki/multi.md",
          title: "Multi",
          kind: "concept",
          body: "alpha\nbeta\ngamma"
        }
      ],
      pattern: "alpha\\nbeta",
      outputMode: "content",
      multiline: true,
      invertMatch: true
    });
    expect(multilineInverted).toEqual({
      outputMode: "content",
      hits: [
        {
          docId: "multi",
          path: "wiki/multi.md",
          line: 3,
          col: 1,
          match: "gamma",
          before: [],
          after: []
        }
      ]
    });
  });

  it("reports line-accurate diffs between document revisions", () => {
    const oldRevision: DocRevision = {
      docId: "policy",
      rev: 1,
      body: "Line one\nLine two\nLine three",
      source: "human",
      actorId: "user-a"
    };
    const newRevision: DocRevision = {
      docId: "policy",
      rev: 2,
      body: "Line one\nLine 2 updated\nLine three\nLine four",
      source: "agent",
      agentRunId: "run-1"
    };

    expect(diffRevisions(oldRevision, newRevision).lines).toEqual([
      { kind: "equal", oldLine: 1, newLine: 1, text: "Line one" },
      { kind: "delete", oldLine: 2, text: "Line two" },
      { kind: "insert", newLine: 2, text: "Line 2 updated" },
      { kind: "equal", oldLine: 3, newLine: 3, text: "Line three" },
      { kind: "insert", newLine: 4, text: "Line four" }
    ]);
  });

  it("maps blame lines back to the human or run that last touched them", () => {
    const blame = blameRevisionLines([
      {
        docId: "policy",
        rev: 1,
        body: "A\nB\nC",
        source: "human",
        actorId: "user-a",
        committedAt: "2026-04-26T00:00:00.000Z"
      },
      {
        docId: "policy",
        rev: 2,
        body: "A\nB2\nC",
        source: "agent",
        agentRunId: "run-2",
        committedAt: "2026-04-26T00:01:00.000Z"
      }
    ]);

    expect(blame.lines).toEqual([
      {
        line: 1,
        text: "A",
        rev: 1,
        source: "human",
        actorId: "user-a",
        committedAt: "2026-04-26T00:00:00.000Z"
      },
      {
        line: 2,
        text: "B2",
        rev: 2,
        source: "agent",
        agentRunId: "run-2",
        committedAt: "2026-04-26T00:01:00.000Z"
      },
      {
        line: 3,
        text: "C",
        rev: 1,
        source: "human",
        actorId: "user-a",
        committedAt: "2026-04-26T00:00:00.000Z"
      }
    ]);
  });

  it("plans a doc_versions-backed revert as a new revision", () => {
    const target: DocRevision = {
      docId: "policy",
      rev: 1,
      body: "Original body",
      bodySha256: systemSha256Hex("Original body"),
      frontmatter: { kind: "policy" },
      source: "human",
      actorId: "user-a"
    };

    const revert = planRevisionRevert({
      current: {
        ...docs[0]!,
        rev: 3,
        body: "Changed body"
      },
      target,
      source: "agent",
      agentRunId: "run-revert"
    });

    expect(revert.document).toMatchObject({
      id: "policy",
      rev: 4,
      body: "Original body",
      bodySha256: systemSha256Hex("Original body")
    });
    expect(revert.version).toMatchObject({
      docId: "policy",
      rev: 4,
      source: "agent",
      agentRunId: "run-revert"
    });
  });

  it("detects broken wiki links with exact source locations", () => {
    const result = lintWorkspace({
      documents: [
        ...docs,
        {
          id: "bad",
          path: "wiki/policies/bad.md",
          title: "Bad Links",
          kind: "concept",
          body: "Known [[Security Policy]].\nMissing [[Ghost Page|ghost]]."
        }
      ]
    });

    expect(result.brokenLinks).toEqual([
      {
        kind: "broken_wikilink",
        docId: "bad",
        path: "wiki/policies/bad.md",
        line: 2,
        col: 9,
        target: "Ghost Page",
        message: "Broken wiki link: [[Ghost Page]]"
      }
    ]);
  });
});
