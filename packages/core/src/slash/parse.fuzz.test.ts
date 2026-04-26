import { describe, expect, it } from "vitest";
import { slashCommandCatalog } from "./catalog.js";
import { parseSlash } from "./parse.js";

const words = ["policy", "onboarding", "alpha", "team", "wiki", "draft", "review", "qa"];
const argNames = ["tone", "target", "mode", "topk", "threshold", "since", "audience"];
const argValues = ["executive", "wiki/policies", "literal", "10", "0.9", "7d", "editors"];

describe("parseSlash fuzz path", () => {
  it("does not crash on 10k generated catalog commands", () => {
    let seed = 0x5eed;

    for (let index = 0; index < 10_000; index += 1) {
      const command = slashCommandCatalog[next(seed + index) % slashCommandCatalog.length];
      const input = buildInput(command.verb, seed + index);
      const parsed = parseSlash(input, {
        docId: `doc-${index % 17}`,
        selection: index % 3 === 0 ? { docId: `doc-${index % 17}`, from: 1, to: 12 } : null
      });

      expect(parsed.verb).toBe(command.verb);
      seed = next(seed);
    }
  });
});

function buildInput(verb: string, seed: number): string {
  const parts = [`/${verb}`];
  const wordCount = next(seed) % 4;
  for (let index = 0; index < wordCount; index += 1) {
    parts.push(words[next(seed + index) % words.length]);
  }

  const argCount = next(seed + 91) % 3;
  for (let index = 0; index < argCount; index += 1) {
    const argName = argNames[next(seed + index * 7) % argNames.length];
    const argValue = argValues[next(seed + index * 13) % argValues.length];
    parts.push(`--${argName}`, argValue);
  }

  if (seed % 11 === 0) {
    parts.push(`path:./fixtures/${words[seed % words.length]}.md`);
  }

  if (seed % 17 === 0) {
    parts.push('"quoted phrase"');
  }

  return parts.join(" ");
}

function next(seed: number): number {
  return (seed * 1_664_525 + 1_013_904_223) >>> 0;
}
