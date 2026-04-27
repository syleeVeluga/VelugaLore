export const desktopIpcCommands = [
  "open_workspace",
  "list_documents",
  "read_doc",
  "create_doc",
  "create_folder",
  "rename_doc",
  "move_doc",
  "duplicate_doc",
  "archive_doc",
  "restore_doc",
  "update_doc_metadata",
  "apply_patch",
  "list_pending_approvals"
] as const;

export const desktopIpcEvents = ["doc_changed", "agent_run_progress", "agent_run_completed"] as const;

export type DesktopIpcCommandName = (typeof desktopIpcCommands)[number];
export type DesktopIpcEventName = (typeof desktopIpcEvents)[number];

export function assertDesktopIpcSurface(input: {
  commands: readonly string[];
  events: readonly string[];
}): void {
  const missingCommands = desktopIpcCommands.filter((command) => !input.commands.includes(command));
  const missingEvents = desktopIpcEvents.filter((event) => !input.events.includes(event));

  if (missingCommands.length > 0 || missingEvents.length > 0) {
    throw new Error(
      `Desktop IPC surface missing commands=[${missingCommands.join(",")}] events=[${missingEvents.join(",")}]`
    );
  }
}
