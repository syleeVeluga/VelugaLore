export class ToolNotAllowedError extends Error {
  readonly code = "TOOL_NOT_ALLOWED";

  constructor(
    readonly agentId: string,
    readonly toolId: string
  ) {
    super(`Tool "${toolId}" is not allowed for agent "${agentId}"`);
    this.name = "ToolNotAllowedError";
  }
}

export type ToolHandler = (input: unknown) => Promise<unknown> | unknown;

export const agentToolAllowlists = {
  draft: ["read_doc", "read_neighbors", "search_workspace", "read_style_guide", "read_glossary"],
  improve: ["read_doc", "read_style_guide", "read_glossary", "lint_terms"],
  ask: ["search_workspace", "grep_workspace", "glob_workspace", "read_doc", "read_neighbors", "embed"],
  echo: []
} as const satisfies Record<string, readonly string[]>;

export type AgentToolAllowlists = Record<string, readonly string[]>;

export class ToolRuntime {
  constructor(
    private readonly handlers: Record<string, ToolHandler>,
    private readonly allowlists: AgentToolAllowlists = agentToolAllowlists
  ) {}

  async call(agentId: string, toolId: string, input: unknown): Promise<unknown> {
    const allowedTools = this.allowlists[agentId] ?? [];
    const handler = this.handlers[toolId];
    if (!allowedTools.includes(toolId) || !handler) {
      throw new ToolNotAllowedError(agentId, toolId);
    }

    return handler(input);
  }
}
