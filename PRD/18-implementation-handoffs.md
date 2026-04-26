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
