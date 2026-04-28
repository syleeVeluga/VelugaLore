---
section: 16
title: "위험 & 가설 / Risks & Assumptions"
parent: VelugaLore PRD
status: Draft (implementation-ready)
last_updated: 2026-04-26
---

# 16. 위험 & 가설 / Risks & Assumptions

위험과 가설은 *추적 가능* 해야 한다 — 각각 **트리거 신호**, **완화 단계**, **검증 시점** 을 명시.

## 16.1 위험 / Risks

각 위험 행은: 종류 · 트리거 신호(언제 발현하는가) · 단계별 완화(낮음→높음) · 담당자 · 마지막 점검 시점.

### R1 — opencode 패턴 차용이 시간이 지나며 변하거나, 옵션 차용한 코드가 업스트림과 어긋남
- **종류**: 기술 / 의존성
- **트리거 신호** — opencode 의 sdk-server API 가 breaking 변경 / 우리 `vendor/` rebase 가 매주 5+ conflict
- **완화 단계**:
  - L1 (기본): 자체 구현 우선 (§4.3). 옵션 차용 0 인 상태로 v1 GA.
  - L2 (옵션 차용 시): `vendor/` 격리 + 의존 모듈 최소화 + 매주 동기화 잡.
  - L3 (업스트림 격차 큼): 차용 모듈을 자체 구현으로 대체 (1주 분량 작업으로 미리 추정).
- **담당자**: agent-server / desktop core 팀
- **마지막 점검**: 2026-04-26 — v1 GA critical path 에 차용 0 (D6 결정 후)

### R2 — pgvector 인덱스 성능 한계
- **종류**: 기술 / 성능
- **트리거 신호** — `weki_search_latency_seconds{tool="find"}` p95 > 3s 또는 vault 가 100k 노드 진입
- **완화 단계**:
  - L1: ivfflat (lists=100) — v1 default.
  - L2 (10만 노드 또는 p95 > 3s): HNSW 마이그레이션 (§8.5.4 zero-downtime 절차).
  - L3 (100만 노드): `halfvec` 16-bit quantization + 차원 1024d truncate (§8.5.3).
  - L4 (1M+): `vault_id` 기반 파티셔닝 + 별도 검색 클러스터 (read replica).
- **담당자**: db / agent-server 팀
- **마지막 점검**: 2026-04-26

### R3 — 사용자는 Obsidian 을 안 떠난다
- **종류**: 사용자 / 채택
- **트리거 신호** — M1 사용성 테스트에서 "Obsidian 을 두고 갈아탈 이유 1순위" 응답 < 50%
- **완화 단계**:
  - L1: **Obsidian compatibility mode** — 같은 workspace 폴더를 둘 다 마운트, 우리는 `wiki/` 만 소유. Obsidian 사용자가 우리 기능을 *옆에서* 시도 가능.
  - L2: Obsidian 플러그인 ("VelugaLore Companion") — Obsidian 안에서 코어 5개 동사 호출.
  - L3: 차별화 포인트 강화 — `curate` (Obsidian 에 없는 능력), 컴파운딩 `/ask` 누적 (Obsidian RAG 플러그인 대비 우위).
- **담당자**: 제품 / 마케팅
- **마지막 점검**: 2026-04-26

### R4 — LLM 비용이 ARPU 초과
- **종류**: 비즈니스 / 비용
- **트리거 신호** — 평균 사용자 월 비용이 월 구독료의 30% 초과
- **완화 단계**:
  - L1: provider 추상화(pydantic-ai) + **사용자 BYO 키** 옵션 (§4.4) — 비용을 사용자에게 직접 전달.
  - L2: 가성비 모델(Haiku/mini/Flash)을 코어 default 로 설정 (§4.4.1).
  - L3: per-agent / per-user 비용 한도 (§12.3.4) + budget 알림.
  - L4: 로컬 임베딩 (`bge-m3-onnx`, §8.5.3) — embedding 비용 0 으로.
  - L5: 응답 캐싱 — 같은 질문은 기존 `kind='qa'` 페이지 재사용 (이미 D7 컴파운딩 설계).
- **담당자**: 제품 / agent-runtime 팀
- **마지막 점검**: 2026-04-26

### R5 — 플러그인을 통한 데이터 유출
- **종류**: 보안 / 신뢰
- **트리거 신호** — 미서명 플러그인이 `read_doc` + `web_fetch` capability 결합 사용
- **완화 단계**:
  - L1: **signed plugins 기본** — 미서명은 "Developer mode" 설정에서만 로드 (§10.2.3).
  - L2: capability allowlist — 플러그인이 매니페스트에 선언한 권한만 (§10.2.3 plugin.toml).
  - L3: 외부 도구(`web_fetch`/MCP) 호출 시 항상 approval queue (§11.4, D11).
  - L4: marketplace 검토 (1st-party) — 우리가 review 한 플러그인만 marketplace 게시.
  - L5: workspace 별 plugin allowlist — admin 이 화이트리스트 명시.
- **담당자**: plugin-sdk / security 팀
- **마지막 점검**: 2026-04-26

### R6 — 코딩 에이전트가 외부 코드를 무단 인용
- **종류**: 법무 / 라이선스
- **트리거 신호** — 사용자가 plugin-sdk 로 작성한 코드가 GPL/AGPL 코드와 substantial similarity
- **완화 단계**:
  - L1: plugin-sdk 가이드라인에 라이선스 헤더 명시 + 외부 코드 인용 시 검사 도구.
  - L2: 우리 marketplace 등록 PR 에서 license-detector 자동 스캔.
  - L3: 발견 시 우선순위 takedown.
- **담당자**: plugin-sdk 팀 + 법무
- **마지막 점검**: 2026-04-26

### R7 (신규) — `curate` 자동 제안의 정확도 부족 — 사용자가 거절률 ↑
- **종류**: 기술 / UX
- **트리거 신호** — `weki_patch_approval_decision_total{agent_id="curate",decision="rejected"}` > 30% (§13.6 F3 over-curation)
- **완화 단계**:
  - L1: 거절률 > 30% 면 자동 트리거 임시 비활성 (§13.6.4 DON'T #5 + #7).
  - L2: 사용자 거절 history 를 negative training 으로 prompt 에 포함.
  - L3: AGENTS.md §3 위키 구조 규칙 강화 가이드 — 사용자가 자기 임계점 명시.
  - L4: M2.5 직후 90일 사용 데이터 분석 → 결정 알고리즘 §13.6.3 수정.
- **담당자**: agent-runtime / 제품
- **마지막 점검**: 2026-04-26 (M2.5 출시 전 사전 모니터링 설정 필요)

### R8 (신규) — Postgres 가 단일 장애점 / Single point of failure
- **종류**: 기술 / 가용성
- **트리거 신호** — Postgres 다운 시 모든 워크스페이스 접근 불가
- **완화 단계**:
  - L1: `desktop` 단독 모드는 local Postgres — 자기 머신 외 의존 0.
  - L2: Team/Enterprise 는 cloud (Supabase/Neon) — provider 의 SLA 위에서 99.9%.
  - L3: read replica + connection pool (PgBouncer) — read 는 항상 가능.
  - L4: 임시 read-only 모드 — write path 만 차단, 사용자가 읽기는 계속 가능.
- **담당자**: infra / db 팀
- **마지막 점검**: 2026-04-26

### R9 (신규) — 한·영 외 언어 사용자 / Language coverage
- **종류**: 사용자 / 시장
- **트리거 신호** — 일·중·영어권 외 사용자가 5% 초과 + i18n 미지원 불만
- **완화 단계**:
  - L1: v1 ko/en. 다른 언어는 사용자 i18n 기여 환영.
  - L2: embedding 모델은 multilingual (`text-embedding-3-small`) → 검색은 자동 다국어.
  - L3: v1.5+ 우선순위 언어 추가 (일·중·스페인 등 시장 지표 따라).
- **담당자**: 제품 / i18n
- **마지막 점검**: 2026-04-26

---

## 16.2 가설 검증 게이트 / Validating assumptions

각 가설은 **검증 시점** + **실험 설계** + **성공 / 실패 기준** + **실패 시 분기** 를 명시. PRD 가 살아있는 가설을 추적하기 위함.

### H1 — 코어 `/draft` + `/improve` 콤보가 "글쓰기 시작 비용" 을 낮춘다

- **검증 시점**: M1 (W4–W6) 종료 직후
- **실험 설계** (5인 사용성 테스트):
  - 참가자: P-STARTUP 2명 + P-IND 1명 + P-EDU 1명 + P-ENT 1명 (모두 비-테크 비중 ≥ 60%).
  - 시나리오: "5분 안에 '신제품 기획안 1장' 초안을 작성하시오" — 도구 자유 (Word/Notion/Obsidian/VelugaLore).
  - 측정: 시작 → 첫 문단 완성까지 시간, 사용자 인지 노력(NASA-TLX), 만족도(7점).
- **성공 기준**:
  - 첫 문단 완성 시간 ≤ 2분 (5인 평균)
  - NASA-TLX < 같은 사용자의 Word/Notion 비교군 -20%
  - 만족도 ≥ 5/7
  - "다시 사용하시겠습니까?" yes 비율 ≥ 80%
- **실패 시 분기**:
  - draft 자체 품질 문제 → §5.5.1 prompt 재설계 + golden set 추가
  - UX 마찰 (slash 메뉴 자체) → §7.4.1 자동완성 개선
  - 둘 다 → M2 시작 전에 1주 buffer 추가, 코어 에이전트 prompt 재교정

### H2 — `IngestAgent` 의 1소스 → 다페이지 산출(fan-out 3~10) 이 사용자 만족도의 1차 견인이다

- **검증 시점**: M2 (W7–W10) 종료 직후
- **실험 설계** (NPS + 사용 패턴 분석):
  - 참가자: M2 베타 사용자 30명 (P-IND 비중 ≥ 50%).
  - 측정:
    - `weki_ingest_fan_out` 분포 (목표: 평균 3~10, A15 게이트)
    - 30일 후 NPS
    - "ingest 가 가장 가치 있다고 느꼈습니까?" 응답
    - 사용자가 ingest 후 `/ask` 누적 효과 *체감* 했는지 (정성 인터뷰 5명)
- **성공 기준**:
  - fan-out 평균 3~10 (A15 통과)
  - NPS ≥ 30
  - "가장 가치 있는 기능" 응답에서 ingest 가 1위 또는 ask 와 묶여 1·2위 (compounding 인지)
  - 인터뷰 5명 중 ≥ 3명이 "wiki 가 자라난다" 표현 자발 사용
- **실패 시 분기**:
  - fan-out 부족 → IngestAgent prompt 의 §5.5.4 행동 규칙 #2 강화 (단일 페이지 비율 ≤ 20% 목표).
  - 가치 인식 부족 → 그래프뷰의 "최근 ingest" 시각화 강화, ingest 직후 자동 `/curate` 제안 흐름 (U3 자동화).
  - NPS < 30 → 페르소나 재검증 (§2 1차 동사 매핑 다시).

### H3 — 데스크톱 우선 전략이 옳다

- **검증 시점**: M3 (W13–W16) 종료 시점 ~ M4 시작 전
- **실험 설계** (사용 시간 분석 + 사용자 인터뷰):
  - 참가자: 데스크톱·웹 둘 다 사용 가능한 베타 사용자 50+.
  - 측정:
    - `weki_session_duration_seconds` by client (desktop/web).
    - 사용자별 desktop:web 비율.
    - 인터뷰 10명: "왜 desktop / 왜 web?"
- **성공 기준**:
  - 데스크톱 사용 시간 비율 ≥ 70% (전체)
  - 데스크톱 단독 사용자 비율 ≥ 40%
  - 인터뷰에서 데스크톱 선택 이유로 "오프라인", "FS 직접 접근", "단축키" 가 우세
- **실패 시 분기**:
  - 비율이 7:3 미달 → 웹을 1급으로 격상 (M4 일부 리소스 → 웹 read-write parity).
  - 비율이 9:1 초과 → 웹 v1.5 로 더 미루고 desktop 만 깊이 강화.

### H4 (신규) — `curate` 가 P-ENT 의 도입 결정 1위 견인

- **검증 시점**: M2.5 (W10–W12) 종료 후 + M3 의 P-ENT 베타
- **실험 설계**:
  - 베타 P-ENT 3개 조직 (각 50+ 사용자).
  - 측정:
    - 사규 import 직후 자동 curate 제안 → 승인률
    - 사규 개정 시 curate 제안 정확도(영향받는 다른 정책 추적률)
    - 의사결정자 인터뷰: "VelugaLore 도입을 어떤 기능으로 정당화했는가?"
- **성공 기준**:
  - curate 제안 승인률 ≥ 60%
  - 영향분석 자동화율 ≥ 80% (A14 와 정합)
  - 인터뷰에서 ≥ 2/3 가 curate 또는 그 효과("정책 망 일관성")를 1순위 인용
- **실패 시 분기**:
  - 승인률 부족 → §13.6.5 F3 (over-curation) 완화 강화 + 결정 알고리즘 보수화.
  - 가치 인식 부족 → P-ENT 페르소나 1차 동사 재검토 (§2.1) — RBAC/감사로 회귀 검토.

### H5 (신규) — 확장 4단계 (T1~T4) 가 *진짜* 사용된다

- **검증 시점**: M4 (W17–W20) 종료 후 + M5 GA 출시 90일
- **실험 설계**:
  - 측정:
    - T1 Skill 작성한 workspace 비율 (90일 누적)
    - T2 마크다운 정의 에이전트 작성 비율
    - T3 플러그인 marketplace 다운로드
    - T4 MCP 서버 등록 비율 (P-ENT 위주)
- **성공 기준**:
  - T1 ≥ 30% workspaces (가벼운 진입점이라 의도)
  - T2 ≥ 10% workspaces
  - T3 marketplace 외부 플러그인 ≥ 5개
  - T4 ≥ 50% P-ENT workspaces
- **실패 시 분기**:
  - T1/T2 부족 → §10.2.0 AGENTS.md 와 §10.2.1 SKILL.md 의 "쉽게 추가하기" 가이드를 첫 사용 onboarding 에 강제 노출.
  - T3 부족 → marketplace seed 콘텐츠 (1st-party 확장 8개 외 추가 8개 우리가 직접 작성).
  - T4 부족 → MCP 통합 가이드 + 인기 사내 시스템(Slack, Confluence, Jira) 의 1st-party 어댑터 제공.

---

## 16.3 가정 / Assumptions (검증 비대상이지만 명시)

이것들은 *지금은 옳다고 가정* 하며, 위반 시 PRD 의 큰 수정이 필요한 항목.

| # | 가정 | 위반 시 영향 |
|---|---|---|
| A.1 | LLM 가격은 v1 GA 시점에 추가로 50% 이상 떨어지지 않는다 | budget 정책 재교정 |
| A.2 | OpenAI / Anthropic / Gemini 가 v1 기간(2026-2027) 내내 안정 운영 | provider 추상화로 완화 |
| A.3 | Postgres 16 + pgvector 0.8 가 우리 규모(≤ 1M 노드)에 충분 | R2 완화 단계로 흡수 |
| A.4 | Tauri 2.x 가 desktop 빌드의 안정 백엔드 | Electron fallback 검토 |
| A.5 | 비-테크 사용자(P-ENT/P-EDU 다수) 가 마크다운 학습 의지 보유 | UX 단순화 추가 작업 |
| A.6 | 회사가 자기 데이터를 외부 LLM provider 에 보내는 것을 *허용* (P-ENT) | 로컬 모델 옵션(§8.5.3 v1.5+) 우선 순위 ↑ |

A.6 가 가장 risky — P-ENT 일부는 외부 API 자체가 보안 정책 위반일 수 있다. v1.5 의 *로컬 임베딩 + 로컬 LLM* (Ollama 통합) 이 첫 follow-up.

---

## 16.4 위험·가설 검토 리듬 / Review cadence

- **매 마일스톤 종료 시** — 해당 마일스톤이 검증해야 할 가설(H1@M1, H2@M2, H4@M2.5, H3@M3, H5@M4·M5) 결과 반영.
- **분기 1회** — 모든 위험의 "마지막 점검" 컬럼 갱신, 트리거 신호 모니터링 결과 검토.
- **CHANGELOG 에 결과 기록** — 가설이 검증/실패되면 §16 + README CHANGELOG 에 결정 사유 명시. 결정 로그(§17.3) 에 새 D 항목 추가 가능.
