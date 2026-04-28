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
  - 현재 agent-server 경로는 Patch/ReadOnlyAnswer 및 approval 흐름 검증용 결정적 테스트 스캐폴딩에 머물러 있다. 이 상태는 제품 acceptance 가 아니며, D13의 실제 OpenAI/Anthropic/Google Gemini provider runtime 은 별도 보정이 필요하다.
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

## Handoff: S-08.6 real LLM provider runtime 보정 계획 스냅샷

- **작업 일자:** 2026-04-28
- **Slice ID 및 PRD 섹션:**
  - `S-08.6`: Real LLM provider runtime
  - 참조: `PRD/04-architecture.md`, `PRD/05-agent-catalog.md`, `PRD/11-security-rbac.md`, `PRD/12-observability.md`, `PRD/13-implementation-guide.md`, `PRD/15-acceptance-criteria.md`
  - 보조 기록: `PRD/18-implementation-handoffs.md`
- **변경된 파일 (문서/하네스):**
  - `README.md`
  - `.agents/harness/slices.json`
  - `.agents/agents.toml`
  - `PRD/00-onepager.md`
  - `PRD/04-architecture.md`
  - `PRD/13-implementation-guide.md`
  - `PRD/14-milestones.md`
  - `PRD/15-acceptance-criteria.md`
  - `PRD/17-appendix.md`
  - `PRD/18-implementation-handoffs.md`
  - `PRD/README.md`
- **정정 요약:**
  - VelugaLore 의 제품 비전은 AI agent 가 문서 워크플로우를 실제로 수행하는 것이다. 따라서 S-06/S-08의 결정적 출력은 계약 검증용 스캐폴딩일 뿐 정상 runtime 으로 인정하지 않는다.
  - 정상 agent runtime 은 OpenAI · Anthropic · Google Gemini 3종 provider 를 모두 first-class 로 갖고, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY` preflight 를 필수로 통과해야 한다.
  - 기본 LLM provider 는 Google Gemini 이며 현재 기본 모델은 `gemini-2.5-flash-lite` (`google-gla`) 로 둔다. OpenAI embedding 우선 결정은 유지한다.
  - S-08.6은 `agent-server` 가 TS 결정적 스캐폴딩 대신 `agent-runtime-py` pydantic-ai 워커를 호출하도록 만드는 보정 slice 다.
- **새 세션 시작 명령:**
  - `powershell -ExecutionPolicy Bypass -File tools/agent-harness.ps1 -Command validate`
  - `powershell -ExecutionPolicy Bypass -File tools/agent-harness.ps1 -Command brief -Slice S-08.6`
- **미증명/미해결된 인수 조건:**
  - 실제 pydantic-ai provider 호출이 `/draft`, `/improve`, `/ask` 에 연결되었는지.
  - 3종 key preflight 가 desktop/agent-server 양쪽에서 actionable error 로 표시되는지.
  - Gemini 기본 모델의 `/draft` live LLM patch 가 approval queue 와 2-phase write 를 통과하는지.
- **PRD 해석 및 변경 사항:**
  - “키 없이 실행 가능”은 당시 구현 상태 설명일 뿐 제품 acceptance 가 아니다.
  - S-08.5는 데스크톱 셸 통합 게이트, S-08.6은 실제 AI agent runtime 게이트로 분리한다.

## Handoff: S-08.6 implementation snapshot before S-09a

- **작업 일자:** 2026-04-28
- **Slice ID 및 PRD 섹션:**
  - `S-08.6`: Real LLM provider runtime
  - 참조: `PRD/04-architecture.md`, `PRD/05-agent-catalog.md`, `PRD/11-security-rbac.md`, `PRD/12-observability.md`, `PRD/13-implementation-guide.md`, `PRD/15-acceptance-criteria.md`
- **구현 확인 스냅샷:**
  - 정상 runtime 에서는 `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY` 3종 preflight 를 통과해야 core agent 가 실행된다.
  - `draft`, `improve`, `ask` 는 `agent-runtime-py` worker 로 위임되고, worker 출력은 `Patch`/`ReadOnlyAnswer` 계약으로 검증된다.
  - 결정적 출력은 `WEKI_AGENT_RUNTIME=test` 에서만 테스트 경로로 사용한다.
- **미증명/미해결된 인수 조건:**
  - 실제 provider key 를 사용한 desktop live smoke 는 이 스냅샷에서 재검증하지 않았다.
  - Gemini 기본 모델의 `/draft` patch preview → approval queue → 2-phase write → disk `.md` 확인은 수동 smoke 로 남아 있다.
- **다음 진행 해석:**
  - S-09a 는 S-08.6의 runtime 경로를 재사용하되, `ingest` 자체의 fan-out/import acceptance 를 별도 slice 로 닫는다.

## Handoff: S-09a IngestAgent and import system operation

- **작업 일자:** 2026-04-28
- **Slice ID 및 PRD 섹션:**
  - `S-09a`: IngestAgent and import system operation
  - 참조: `PRD/05-agent-catalog.md`, `PRD/08-data-model.md`, `PRD/13-implementation-guide.md`, `PRD/15-acceptance-criteria.md`
- **변경된 파일:**
  - `README.md`
  - `PRD/18-implementation-handoffs.md`
  - `packages/agent-server/src/runtime.ts`
  - `packages/agent-server/src/daemon.test.ts`
  - `packages/agent-runtime-py/src/weki_agents/worker.py`
  - `packages/agent-runtime-py/src/weki_agents/evals/ingest.py`
  - `packages/agent-runtime-py/tests/test_s09a_ingest.py`
  - `packages/agent-runtime-py/tests/test_worker.py`
  - `packages/db/src/import-ops.ts`
  - `packages/db/src/import-ops.test.ts`
- **구현 요약:**
  - 정상 agent runtime 의 Python worker 위임 대상에 `ingest` 를 추가했다. `curate` 는 S-09b까지 정상 runtime 미연결 상태로 유지한다.
  - Python worker 의 deterministic/live contract 에 `IngestPatch` 를 추가해 `ingest` 도 pydantic 모델 검증 경로를 탄다.
  - Ingest eval 을 30개 raw 골든셋으로 확장하고, 평균 fan-out 3~10 및 단일 노드 비율 ≤20% gate 를 명시했다.
  - `/import` 시스템 작업용 run-level planner/apply helper 를 추가했다. 한 run 은 `import_runs` 한 행으로 시작해 문서를 생성하고, `succeeded`/`partial`/`failed`, conflict report, fidelity summary, audit row 를 남긴다.
  - Markdown/docx-style fidelity 측정에 heading/link/table/numbering score 를 포함했다.
  - 기존 `rollbackImportRun` 경로는 import run provenance 로 연결된 문서를 한 트랜잭션에서 삭제하고 rollback run/audit row 를 남기는 테스트로 보강했다.
- **테스트 및 하네스 확인 내역:**
  - `powershell -ExecutionPolicy Bypass -File tools/agent-harness.ps1 -Command validate`
  - `powershell -ExecutionPolicy Bypass -File tools/agent-harness.ps1 -Command brief -Slice S-09a`
  - `corepack pnpm lint:deps`
  - `corepack pnpm --filter @weki/core test`
  - `corepack pnpm --filter @weki/db test`
  - `corepack pnpm --filter @weki/agent-server test`
  - `corepack pnpm test`
  - `corepack pnpm build`
  - `python -m unittest discover tests` (`packages/agent-runtime-py`, `PYTHONPATH=src`)
- **미증명/미해결된 인수 조건:**
  - 실제 PDF/URL/image extraction, OCR, embedding 중복 검사, web fetch approval 는 아직 tool/runtime stub 너머로 검증하지 않았다.
  - 실제 `.docx` binary parser 를 통한 50개 문서 fidelity 골든셋은 아직 없다. 현재는 추출 후 구조 snapshot 기준의 docx-style fidelity 측정이다.
  - DB RLS integration test 는 `WEKI_TEST_DATABASE_URL` 미설정으로 skipped 상태다.
- **PRD 해석 및 변경 사항:**
  - S-09a 는 import UI 자체가 아니라 DB/runtime system operation loop 를 먼저 닫는 범위로 해석했다.
  - `import_runs.options.conflict_strategy` 는 현재 안전한 `skip`/`fail` 만 지원한다. 기존 문서 overwrite 는 rollback semantics 가 더 커져 후속 slice 로 남긴다.
