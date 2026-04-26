import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { parseSlash } from "@weki/core";
import { renderSlashInvocation, renderSlashMenuItems, slashCompletionSource } from "./slash-menu.js";

const translate = (key: string): string =>
  ({
    "slash.command.group.core": "Core",
    "slash.draft.example.empty": "Create an outline and first draft for an empty page.",
    "slash.draft.example.prompt": "Draft from a prompt and audience hint.",
    "slash.draft.summary": "Start a draft or expand the selected passage."
  })[key] ?? key;

describe("slash menu rendering", () => {
  it("renders /draft autocomplete with localized help examples", () => {
    const items = renderSlashMenuItems("/dra", translate);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      label: "/draft",
      detail: "Core - Start a draft or expand the selected passage."
    });
    expect(items[0]?.help).toContain("/draft - Create an outline and first draft for an empty page.");
  });

  it("renders a parsed /draft invocation with selection target", () => {
    const invocation = parseSlash("/draft onboarding intro --audience editors", {
      docId: "doc-1",
      selection: { docId: "doc-1", from: 4, to: 12 }
    });

    expect(renderSlashInvocation(invocation, translate)).toEqual({
      title: "/draft",
      summary: "Start a draft or expand the selected passage.",
      target: "selection:doc-1:4:12",
      freeText: "onboarding intro",
      args: ["--audience editors"],
      examples: [
        { input: "/draft", label: "Create an outline and first draft for an empty page." },
        {
          input: "/draft R&D proposal in five bullets --audience executives",
          label: "Draft from a prompt and audience hint."
        }
      ]
    });
  });

  it("exposes CodeMirror completion options for slash commands", () => {
    const state = EditorState.create({ doc: "/dra" });
    const context = {
      state,
      pos: 4,
      explicit: true
    };

    const result = slashCompletionSource(context as never, translate);

    expect(result?.from).toBe(0);
    expect(result?.options[0]).toMatchObject({
      label: "/draft",
      apply: "/draft"
    });
    expect(result?.options[0]?.info).toContain("Create an outline");
  });

  it("opens the slash menu at the bare trigger without explicit completion", () => {
    const state = EditorState.create({ doc: "/" });
    const context = {
      state,
      pos: 1,
      explicit: false
    };

    const result = slashCompletionSource(context as never, translate);

    expect(result?.from).toBe(0);
    expect(result?.options.map((option) => option.label)).toContain("/draft");
  });

  it("applies command labels instead of placeholder examples", () => {
    const state = EditorState.create({ doc: "/imp" });
    const context = {
      state,
      pos: 4,
      explicit: true
    };

    const result = slashCompletionSource(context as never, translate);
    const importCompletion = result?.options.find((option) => option.label === "/import");

    expect(importCompletion?.apply).toBe("/import");
  });
});
