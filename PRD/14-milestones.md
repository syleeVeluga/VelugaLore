---
section: 14
title: "마일스톤·로드맵 / Milestones & Roadmap"
parent: VelugaLore PRD
status: Draft (implementation-ready)
last_updated: 2026-04-29
---

# 14. 마일스톤·로드맵 / Milestones & Roadmap

> 모든 마일스톤은 **사용자 가치 + 측정 가능한 게이트** 를 가진다.

| 마일스톤 | 목표 가치 | 슬라이스 | 게이트 / Gates |
|---|---|---|---|
| **M0 · Foundation** (W1–W3) | 모노레포·DB·셸 부트 | S-01, S-02, S-03 | CI 그린, Postgres RLS 통합테스트 100%. *데스크톱 셸 게이트는 S-08.5로 이연 (§14.1).* |
| **M1 · Editor & Core Draft** (W4–W6) | "/draft 로 글쓰기 시작" | S-04, S-05, S-06, S-07 | 라이브러리 단위 통과(에디터 컴포넌트, 승인 큐, agent_runs). *사용성 게이트("5분 안에 `/draft`")는 S-08.5 셸 + S-08.6 live LLM runtime 이 함께 통과해야 닫힌다 (§14.1).* |
| **M2 · Improve · Ask · Ingest** (W7–W10) | "다듬기·질문·자료 들이기" — compounding 루프의 *전반부 + 후반부* 개통 | S-08 (improve+ask), **S-08.5 (desktop shell catch-up)**, **S-08.6 (real LLM provider runtime)**, S-09a (ingest+import) | 신규 사용자 5분 안에 `/draft` 성공 비율 ≥ 80% (S-08.5+S-08.6 기준 사용성 5인 테스트), 3종 provider key preflight 통과, live LLM patch approval→2-phase write smoke 통과, inbox→wiki ingest 정확도(human eval) ≥ 0.8, 한 raw 가 평균 3~10 노드를 건드림, 사규 zip 임포트 트리/링크 보존 ≥ 0.9 |
| **M2.5 · Curate + Solo identity** (W10–W12) | "wiki 모양 잡기 — 진짜 위키처럼" + Solo 세션 정체성으로 권한 분기 UI 검증 가능 | S-09b (curate + IA ops), **S-12a (Solo identity + dev act-as)** | 100노드 workspace 에서 `/curate` 가 카테고리 제안 정확도 ≥ 0.7, split/merge/move 후 백링크 깨짐 0건, 한 run 통째로 revert 100%, Solo 디폴트로 로그인 UI 0회 노출 + dev act-as 로 4개 역할 임퍼소네이션 (§14.2) |
| **M3 · Workspace Ops & Team** (W13–W16) | "검색·이력·LSP + 팀 모드" | S-10, S-11, S-12b, S-13 | 1만 노드 검색 p50 ≤ 500ms, RBAC 위반 0(퍼즈 1만회), 데스크톱·브라우저 동일 workspace read, OAuth/SAML 로그인 + Solo→Team 무이주 전환 |
| **M4 · Extensibility** (W17–W20) | "사용자가 자기 에이전트를 추가" — 4단계 경로 | S-14a, S-14b, S-14c, S-15 | 비-테크 사용자 1명 10분 내 SKILL.md 추가 동작; 외부 개발자 1명 30분 내 hello-world 플러그인 로드; MCP 호스트 approval 게이트 통과 100% |
| **M5 · GA** (W21–W24) | 회귀·비용·서명 + 1st-party 확장 묶음 출시 | S-16, S-17, 문서, 서명 | 코어 5개 + 시스템 작업 evals 99% 통과, 비용 대시보드, 서명된 빌드 4 OS, marketplace 에 1st-party 확장 에이전트 ≥ 8개 |

## 14.1 데스크톱 셸 게이트 이연 / Desktop shell gate deferral

원래 M0 게이트 중 하나였던 **"데스크톱 셸이 빈 workspace 열기"** 는 **S-08.5 (desktop shell catch-up)** 에서 닫는다. M1 게이트인 **"신규 사용자 5분 안에 `/draft` 성공"** 은 셸만으로는 충분하지 않으며, **S-08.6 (real LLM provider runtime)** 에서 실제 pydantic-ai provider 호출까지 통과해야 닫는다.

### 이연 사유

S-01~S-08은 모두 백엔드/라이브러리 슬라이스로 진행되었고, 슬라이스 카탈로그(§13.3)에 Tauri 셸 스캐폴드를 명시하는 슬라이스가 누락되어 있었다. 이를 별도의 *catch-up* 슬라이스(S-08.5)로 명시했다. 다만 이후 확인 결과 S-06/S-08의 에이전트 출력은 실제 LLM provider 호출이 아니라 계약 검증용 스캐폴딩이므로, M1 사용성 게이트는 S-08.6의 live LLM runtime 보정까지 포함해 검증한다 (§13.7.9 참조).

### 현재 상태 (2026-04-29)

S-08.5 는 §13.7.3 9단계 사람 손 smoke 가 Tauri 창에서 1회 통과되어 닫혔다. S-08.6 은 3종 provider key preflight + Gemini 기본 모델 live `/draft` smoke 가 1회 통과되어 닫혔다 (close-out 상세는 `PRD/18-implementation-handoffs.md` 참조).

- ~~`pnpm --filter @weki/desktop dev` 또는 생성된 developer executable로 빈 workspace 열기.~~ **closed (S-08.5, 2026-04-29).**
- ~~`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY` 3종 preflight 통과.~~ **closed (S-08.6, 2026-04-29).**
- ~~Gemini 기본 모델(`gemini-2.5-flash-lite`)의 `/draft` live LLM 호출 → patch preview → approval queue 승인 → 2-phase write → 디스크 반영.~~ **closed (S-08.6, 2026-04-29).**
- 같은 markdown 파일의 외부 편집이 5초 안에 renderer로 반영되는지 확인.

### 이연이 위험을 키우지 않는 이유

- S-04(에디터)·S-05(에이전트 데몬)·S-06(Draft)·S-07(승인 큐)·S-08(Improve/Ask)은 라이브러리 단위 테스트와 evals 으로 자체 검증되어 있어 **셸 부재 자체가 품질 게이트를 약화시키지 않는다**.
- S-08.5는 *기존 라이브러리의 통합 검증* 이 주 목적이고, S-08.6은 *AI agent runtime 의 실사용성 검증* 이 주 목적이다. 둘 중 하나라도 통과하지 못하면 M1/M2 게이트는 닫히지 않는다.
- M2의 Ingest(S-09a)·M2.5의 Curate(S-09b)는 UI 검증이 사실상 필수이므로, S-08.5를 M2 안에 두는 것은 *후속 슬라이스의 검증 환경 확보* 도 겸한다.

### 향후 누락 게이트 발생 시 처리 원칙

- 슬라이스 카탈로그(§13.3)와 마일스톤 게이트(§14)는 **양방향 트레이서빌리티**를 가져야 한다. 게이트 하나가 어떤 슬라이스에도 매핑되지 않으면 그 자체로 PR 리뷰 차단 사유.
- 누락이 발견되면 (a) 해당 게이트를 닫는 슬라이스를 신설하거나 (b) 가장 가까운 후속 슬라이스에 묶고, 본 §14.1 처럼 **이연 사유와 영향 분석을 PRD에 명시**한다.

## 14.2 S-12 분할 / S-12 split: Solo identity vs Team SSO

원래 단일 슬라이스였던 **S-12 (RBAC + 멀티유저)** 는 다음 두 슬라이스로 분할된다.

- **S-12a — Solo 세션 정체성 + dev act-as 토글** (M2.5, §13.8 상세 명세)
- **S-12b — Team/Enterprise 멀티유저** (M3, 원래 S-12 의 SSO/SCIM/멤버 UI 부분)

### 분할 사유

S-09b (Curate, M2.5)·S-10/S-11 (M3) 의 권한 분기 UI 는 *권한이 발화하는 세션 정체성* 이 있어야 손으로 검증 가능하다. 그러나 원안 S-12 는 SSO·SCIM·멤버 UI 까지 한 덩어리라 M3 까지 미뤄져 있어, 그 사이 슬라이스들이 권한 분기를 *RLS 위에서* 검증할 수단이 없는 상태였다. 동시에 §11.2 의 **Solo 모드** 는 P-IND 페르소나 대상으로 RBAC 비활성·single user 로 이미 정의되어 있어, 인증 흐름 없이도 v1 가치가 성립한다. 두 사실을 합쳐, Solo 인프라(`app.user_id` 미들웨어 + 로컬 정체성 + dev 임퍼소네이션)는 M2.5 로 끌어오고 Team/Enterprise 인증·UI 는 M3 그대로 둔다.

### 분할이 위험을 키우지 않는 이유

- §11.3.1 의 RLS 정책·`current_user_org_ids()` 헬퍼·역할 매트릭스는 S-02 에서 이미 구현되어 있다. S-12a 는 *기존 인프라를 발화시키는* 슬라이스이며 새 권한 모델을 만들지 않는다.
- S-12a 의 데이터 모델 변경은 0 — Solo 의 single membership 행은 S-12b 가 첫 owner 로 자연스럽게 승격할 수 있다. §11.2 의 "데이터 이동 없이 설정만으로 가능" 보장 그대로.
- Act-as 토글은 dev-only 로 hard-gate (env var + Tauri `cfg(debug_assertions)` + 빌드-타임 grep 가드 3중) — 프로덕션 권한 우회 가능성을 닫는다. 자세한 가드 표는 §13.8.5.
- M3 의 RBAC 위반 fuzz 게이트(1만회)는 S-12b 에서 그대로 닫힌다. S-12a 는 그 게이트의 *부분집합* 인 Solo 정체성 발화를 닫고, 통합 테스트로 회귀를 막는다.

### 트레이서빌리티

| 원안 S-12 DOD 항목 | 닫는 슬라이스 |
|---|---|
| reader/editor/admin/owner permissions match matrix | S-12b (실 멀티유저) + S-12a 의 dev act-as 로 사전 검증 |
| write denial is audited | S-12a (Solo 사용자가 reader 임퍼소네이션 시 검증) + S-12b (실제 reader 멤버) |
| session user is set for RLS | **S-12a** (전적으로) |
| mode settings cover Solo Team Enterprise | S-12a (Solo 디폴트) + S-12b (Team/Enterprise 토글) |
