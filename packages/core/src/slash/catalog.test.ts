import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { slashCommandCatalog } from "./catalog.js";

describe("slashCommandCatalog", () => {
  it("provides one-line help and examples for every command", () => {
    for (const command of slashCommandCatalog) {
      expect(command.summaryKey).toMatch(/^slash\.[a-z-]+\.summary$/);
      expect(command.examples.length).toBeGreaterThan(0);
      expect(command.examples.every((example) => example.input.startsWith(`/${command.verb}`))).toBe(true);
    }
  });

  it("has i18n entries for command summaries and examples", () => {
    const en = JSON.parse(readFileSync(path.resolve("src/i18n/en.json"), "utf8")) as Record<string, string>;
    const ko = JSON.parse(readFileSync(path.resolve("src/i18n/ko.json"), "utf8")) as Record<string, string>;
    const keys = slashCommandCatalog.flatMap((command) => [
      command.summaryKey,
      ...command.examples.map((example) => example.labelKey)
    ]);

    for (const key of keys) {
      expect(en[key], key).toEqual(expect.any(String));
      expect(ko[key], key).toEqual(expect.any(String));
    }
  });
});
