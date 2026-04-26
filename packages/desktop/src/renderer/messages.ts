export type DesktopLocale = "en" | "ko";

export const desktopMessages = {
  en: {
    "desktop.app.title": "WekiDocs",
    "desktop.workspace.path": "Workspace path",
    "desktop.workspace.open": "Open Workspace",
    "desktop.workspace.browse": "Browse…",
    "desktop.workspace.empty": "No workspace",
    "desktop.mode.analyze": "Analyze",
    "desktop.mode.edit": "Edit",
    "desktop.files.title": "Files",
    "desktop.files.new": "New Note",
    "desktop.files.empty": "Empty",
    "desktop.editor.empty": "Open or create a note",
    "desktop.editor.rev": "rev",
    "desktop.agent.title": "Agent",
    "desktop.agent.runDraft": "Run /draft",
    "desktop.agent.pending": "Pending",
    "desktop.agent.approve": "Approve",
    "desktop.agent.reject": "Reject",
    "desktop.agent.idle": "Idle",
    "desktop.agent.running": "Running",
    "desktop.agent.applied": "Applied",
    "desktop.agent.rejected": "Rejected",
    "desktop.agent.preview": "Preview",
    "desktop.status.ready": "Ready",
    "desktop.status.opened": "Workspace opened",
    "desktop.status.created": "Note created",
    "desktop.status.saved": "Saved",
    "desktop.status.error": "Error"
  },
  ko: {
    "desktop.app.title": "WekiDocs",
    "desktop.workspace.path": "워크스페이스 경로",
    "desktop.workspace.open": "워크스페이스 열기",
    "desktop.workspace.browse": "찾아보기…",
    "desktop.workspace.empty": "워크스페이스 없음",
    "desktop.mode.analyze": "분석",
    "desktop.mode.edit": "편집",
    "desktop.files.title": "파일",
    "desktop.files.new": "새 노트",
    "desktop.files.empty": "비어 있음",
    "desktop.editor.empty": "노트를 열거나 만드세요",
    "desktop.editor.rev": "rev",
    "desktop.agent.title": "에이전트",
    "desktop.agent.runDraft": "/draft 실행",
    "desktop.agent.pending": "대기 중",
    "desktop.agent.approve": "승인",
    "desktop.agent.reject": "거절",
    "desktop.agent.idle": "대기",
    "desktop.agent.running": "실행 중",
    "desktop.agent.applied": "적용됨",
    "desktop.agent.rejected": "거절됨",
    "desktop.agent.preview": "미리보기",
    "desktop.status.ready": "준비됨",
    "desktop.status.opened": "워크스페이스 열림",
    "desktop.status.created": "노트 생성됨",
    "desktop.status.saved": "저장됨",
    "desktop.status.error": "오류"
  }
} as const;

export type DesktopMessageKey = keyof (typeof desktopMessages)["en"];

export function createDesktopTranslator(locale: DesktopLocale = "en"): (key: string) => string {
  const messages = desktopMessages[locale];
  return (key) => messages[key as DesktopMessageKey] ?? desktopMessages.en[key as DesktopMessageKey] ?? key;
}
