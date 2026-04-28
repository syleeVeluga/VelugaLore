---
section: 18
title: "구현 핸드오프 / Implementation Handoffs"
parent: VelugaLore PRD
status: Living log
last_updated: 2026-04-28
---

# Implementation Handoffs

본 문서는 `AGENTS.md`의 "Handoff Format" 가이드라인에 따라 진행된 작업 내역과 PRD 해석/변경 사항을 스냅샷 형태로 기록하는 곳입니다.
PRD와 실제 구현 간의 동기화를 위해 참조됩니다.

## Handoff: S-01 ~ S-06 초기 부트스트랩 및 코어 에이전트 세팅 스냅샷

- **작업 일자:** 2026-04-26
- **Slice ID 및 PRD 섹션:** 
  - `S-01`: 모노레포 부트스트랩 (PRD/09)
  - `S-02`: Postgres 스키마 v1 + drizzle 마이그레이션 (PRD/08)
  - `S-05`: Agent daemon (PRD/04.3, PRD/10)
  - `S-06`: DraftAgent 코어 세팅 (PRD/05.1, PRD/04.4)
  - (일부 스캐폴딩) `S-03` Workspace 로컬 파일 시스템 워처, `S-04` 에디터 코어 기능
- **변경된 파일 (실제 구현된 구조):**
  - `apps/docs`, `apps/marketing`
  - `packages/` 내부 패키지들 (`core`, `db`, `desktop`, `editor`, `graph`, `markdown-lsp`, `plugin-sdk`, `cli`, `agent-server`, `agent-runtime-py`, `web`)
  - `turbo.json`, `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`
- **테스트 및 로컬 확인 내역:**
  - 모노레포 의존성 구성(`pnpm i`) 및 터보레포 캐싱 설정 완료.
  - `db/migrations/0001_initial_schema.sql` 초기화 및 Drizzle 스키마 구성.
  - Python 기반 pydantic-ai `weki_agents` 초기 진입점(`draft.py`) 구축.
- **미증명/미해결된 인수 조건 (AC):**
  - 로컬 환경의 완전한 End-to-End 동작(데이터베이스 생성부터 에이전트 답변이 웹으로 오가는 과정)에 대한 승인 큐 테스트는 아직 미완료 상황임.
  - Drizzle 스키마에 대한 완벽한 RLS(`Row Level Security`) 테스트 커버리지가 더 필요한 상태.
- **PRD 해석 및 변경 사항:**
  - `PRD/09-code-layout.md` 구조를 정확하게 준수하여 스캐폴딩이 이루어짐.
  - `agent-server`는 `daemon.ts` 형태로 TypeScript로 구현되었으며, `agent-runtime-py`는 `pyproject.toml`을 쓰는 표준 Python 패키지로 분리하는 방식이 그대로 채택됨.

## Handoff: S-08.5 desktop shell catch-up 문서·검증 스냅샷

- **작업 일자:** 2026-04-28
- **Slice ID 및 PRD 섹션:**
  - `S-08.5`: Desktop shell catch-up: first runnable desktop build
  - 참조: `PRD/04-architecture.md`, `PRD/07-editor-ui.md`, `PRD/09-code-layout.md`, `PRD/13-implementation-guide.md`, `PRD/14-milestones.md`
  - 보조 기록: `PRD/18-implementation-handoffs.md`
- **변경된 파일 (문서/하네스):**
  - `.agents/harness/slices.json`
  - `.agents/agents.toml`
  - `PRD/13-implementation-guide.md`
  - `PRD/14-milestones.md`
  - `PRD/18-implementation-handoffs.md`
  - `PRD/README.md`
- **구현 상태 요약:**
  - `packages/desktop`는 React/Vite renderer, Tauri 2 `src-tauri`, IPC contract, renderer tests, production guard, desktop README를 가진 상태다.
  - Windows developer test executable은 `pnpm --filter @weki/desktop exec tauri build` 로 생성 가능하며, 현재 기준 산출물은 `packages/desktop/src-tauri/target/release/weki-desktop.exe` 이다.
  - Tauri bundling은 의도적으로 비활성화되어 있어 installer 산출물(MSI/NSIS)은 아직 없다. 서명·notarization·installer는 M5 release hardening 범위로 유지한다.
  - 현재 agent-server 경로는 로컬 deterministic 구현으로 Patch/ReadOnlyAnswer 및 approval 흐름 검증에 초점을 둔다. OpenAI/Anthropic/Gemini API key 없이 desktop shell launch가 가능하며, D13의 v1 provider 결정은 변경하지 않는다.
- **테스트 및 하네스 확인 내역:**
  - `powershell -ExecutionPolicy Bypass -File tools/agent-harness.ps1 -Command validate`
  - `powershell -ExecutionPolicy Bypass -File tools/agent-harness.ps1 -Command list`
  - `powershell -ExecutionPolicy Bypass -File tools/agent-harness.ps1 -Command brief -Slice S-08.5`
- **미증명/미해결된 인수 조건:**
  - §13.7.3의 9단계 수동 smoke: `/draft` slash command → patch preview → approval queue 승인 → 2-phase write → 디스크 `.md` 확인.
  - 승인된 patch의 `body_sha256` 일치.
  - 외부 markdown 편집이 S-03 watcher를 통해 5초 안에 renderer로 반영되는지.
- **PRD 해석 및 변경 사항:**
  - S-08.5는 "개발자용 실행 파일 생성 가능"만으로 닫지 않는다. 마일스톤 게이트는 사람 손 smoke가 통과되어야 닫힌다.
  - S-08.5 brief가 이 handoff 문서를 읽도록 `.agents/harness/slices.json`에 `PRD/18-implementation-handoffs.md`를 추가했다.
  - `.agents/agents.toml`의 role registry는 S-08.5, S-12a/S-12b, S-09b 등 현재 slice map의 primary ownership과 맞도록 갱신했다.
