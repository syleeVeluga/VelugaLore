---
section: 14
title: "마일스톤·로드맵 / Milestones & Roadmap"
parent: WekiDocs PRD
status: Draft (implementation-ready)
last_updated: 2026-04-26
---

# 14. 마일스톤·로드맵 / Milestones & Roadmap

> 모든 마일스톤은 **사용자 가치 + 측정 가능한 게이트** 를 가진다.

| 마일스톤 | 목표 가치 | 슬라이스 | 게이트 / Gates |
|---|---|---|---|
| **M0 · Foundation** (W1–W3) | 모노레포·DB·셸 부트 | S-01, S-02, S-03 | CI 그린, Postgres RLS 통합테스트 100%. *데스크톱 셸 게이트는 S-08.5로 이연 (§14.1).* |
| **M1 · Editor & Core Draft** (W4–W6) | "/draft 로 글쓰기 시작" | S-04, S-05, S-06, S-07 | 라이브러리 단위 통과(에디터 컴포넌트, 승인 큐, agent_runs). *사용성 게이트("5분 안에 `/draft`")는 S-08.5에서 셸과 함께 검증 (§14.1).* |
| **M2 · Improve · Ask · Ingest** (W7–W10) | "다듬기·질문·자료 들이기" — compounding 루프의 *전반부 + 후반부* 개통 | S-08 (improve+ask), **S-08.5 (desktop shell catch-up)**, S-09a (ingest+import) | 신규 사용자 5분 안에 `/draft` 성공 비율 ≥ 80% (S-08.5 기준 사용성 5인 테스트), inbox→wiki ingest 정확도(human eval) ≥ 0.8, 한 raw 가 평균 3~10 노드를 건드림, 사규 zip 임포트 트리/링크 보존 ≥ 0.9 |
| **M2.5 · Curate** (W10–W12) | "wiki 모양 잡기 — 진짜 위키처럼" — Karpathy compounding 루프의 *모양* 축 완성 | S-09b (curate + IA ops) | 100노드 workspace 에서 `/curate` 가 카테고리 제안 정확도 ≥ 0.7, split/merge/move 후 백링크 깨짐 0건, 한 run 통째로 revert 100% |
| **M3 · Workspace Ops & Team** (W13–W16) | "검색·이력·LSP + 팀 모드" | S-10, S-11, S-12, S-13 | 1만 노드 검색 p50 ≤ 500ms, RBAC 위반 0(퍼즈 1만회), 데스크톱·브라우저 동일 workspace read |
| **M4 · Extensibility** (W17–W20) | "사용자가 자기 에이전트를 추가" — 4단계 경로 | S-14a, S-14b, S-14c, S-15 | 비-테크 사용자 1명 10분 내 SKILL.md 추가 동작; 외부 개발자 1명 30분 내 hello-world 플러그인 로드; MCP 호스트 approval 게이트 통과 100% |
| **M5 · GA** (W21–W24) | 회귀·비용·서명 + 1st-party 확장 묶음 출시 | S-16, S-17, 문서, 서명 | 코어 5개 + 시스템 작업 evals 99% 통과, 비용 대시보드, 서명된 빌드 4 OS, marketplace 에 1st-party 확장 에이전트 ≥ 8개 |

## 14.1 데스크톱 셸 게이트 이연 / Desktop shell gate deferral

원래 M0 게이트 중 하나였던 **"데스크톱 셸이 빈 workspace 열기"** 와 M1 게이트인 **"신규 사용자 5분 안에 `/draft` 성공"** 은 모두 **S-08.5 (desktop shell catch-up)** 슬라이스에서 함께 닫는다.

### 이연 사유

S-01~S-08은 모두 백엔드/라이브러리 슬라이스로 진행되었고, 슬라이스 카탈로그(§13.3)에 Tauri 셸 스캐폴드를 명시하는 슬라이스가 누락되어 있었다. 이를 별도의 *catch-up* 슬라이스(S-08.5)로 명시하고, M0의 셸 게이트 + M1의 사용성 게이트를 한 번에 검증한다 (§13.7 참조).

### 이연이 위험을 키우지 않는 이유

- S-04(에디터)·S-05(에이전트 데몬)·S-06(Draft)·S-07(승인 큐)·S-08(Improve/Ask)은 라이브러리 단위 테스트와 evals 으로 자체 검증되어 있어 **셸 부재 자체가 품질 게이트를 약화시키지 않는다**.
- S-08.5는 *기존 라이브러리의 통합 검증* 이 주 목적이므로, 통과하지 못하면 그 자체가 S-04~S-08 어딘가의 결함을 드러내는 부수효과를 가진다.
- M2의 Ingest(S-09a)·M2.5의 Curate(S-09b)는 UI 검증이 사실상 필수이므로, S-08.5를 M2 안에 두는 것은 *후속 슬라이스의 검증 환경 확보* 도 겸한다.

### 향후 누락 게이트 발생 시 처리 원칙

- 슬라이스 카탈로그(§13.3)와 마일스톤 게이트(§14)는 **양방향 트레이서빌리티**를 가져야 한다. 게이트 하나가 어떤 슬라이스에도 매핑되지 않으면 그 자체로 PR 리뷰 차단 사유.
- 누락이 발견되면 (a) 해당 게이트를 닫는 슬라이스를 신설하거나 (b) 가장 가까운 후속 슬라이스에 묶고, 본 §14.1 처럼 **이연 사유와 영향 분석을 PRD에 명시**한다.
