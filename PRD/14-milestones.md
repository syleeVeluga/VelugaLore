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
| **M0 · Foundation** (W1–W3) | 모노레포·DB·셸 부트 | S-01, S-02, S-03 | CI 그린, Postgres RLS 통합테스트 100%, 데스크톱 셸이 빈 workspace 열기 |
| **M1 · Editor & Core Draft** (W4–W6) | "/draft 로 글쓰기 시작" | S-04, S-05, S-06, S-07 | 신규 사용자 5분 안에 `/draft` 성공 비율 ≥ 80% (사용성 5인 테스트) |
| **M2 · Improve · Ask · Ingest** (W7–W10) | "다듬기·질문·자료 들이기" — compounding 루프의 *전반부 + 후반부* 개통 | S-08 (improve+ask), S-09a (ingest+import) | inbox→wiki ingest 정확도(human eval) ≥ 0.8, 한 raw 가 평균 3~10 노드를 건드림, 사규 zip 임포트 트리/링크 보존 ≥ 0.9 |
| **M2.5 · Curate** (W10–W12) | "wiki 모양 잡기 — 진짜 위키처럼" — Karpathy compounding 루프의 *모양* 축 완성 | S-09b (curate + IA ops) | 100노드 workspace 에서 `/curate` 가 카테고리 제안 정확도 ≥ 0.7, split/merge/move 후 백링크 깨짐 0건, 한 run 통째로 revert 100% |
| **M3 · Workspace Ops & Team** (W13–W16) | "검색·이력·LSP + 팀 모드" | S-10, S-11, S-12, S-13 | 1만 노드 검색 p50 ≤ 500ms, RBAC 위반 0(퍼즈 1만회), 데스크톱·브라우저 동일 workspace read |
| **M4 · Extensibility** (W17–W20) | "사용자가 자기 에이전트를 추가" — 4단계 경로 | S-14a, S-14b, S-14c, S-15 | 비-테크 사용자 1명 10분 내 SKILL.md 추가 동작; 외부 개발자 1명 30분 내 hello-world 플러그인 로드; MCP 호스트 approval 게이트 통과 100% |
| **M5 · GA** (W21–W24) | 회귀·비용·서명 + 1st-party 확장 묶음 출시 | S-16, S-17, 문서, 서명 | 코어 5개 + 시스템 작업 evals 99% 통과, 비용 대시보드, 서명된 빌드 4 OS, marketplace 에 1st-party 확장 에이전트 ≥ 8개 |
