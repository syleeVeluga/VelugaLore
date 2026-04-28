---
title: "VelugaLore — One-Pager"
audience: "외부 (투자자·팀 합류 후보·파트너)"
parent: VelugaLore PRD
status: Draft (implementation-ready, v1 GA targeting 2026-Q3)
last_updated: 2026-04-26
---

# VelugaLore

> **옵시디언처럼 보이지만 LLM 이 컴파일러처럼 동작하는 문서 워크스페이스.**
> *An Obsidian-shaped editor where the LLM is a compiler, agents are slash commands.*

자료를 폴더에 떨어뜨리면 문서가 자동으로 정리되어 쌓이고, 글을 쓰는 도중 `/` 한 번이면 "개요 잡아줘", "쉽게 다듬어줘", "관련 노트랑 연결해줘" 같은 일을 한 번에 처리합니다. 위키처럼 노트가 서로 링크로 이어지지만, 노트를 정리하는 일은 사람이 하지 않아도 됩니다.

---

## Problem · 문제

**RAG 챗봇은 매번 처음부터 답을 합성합니다.** 지식이 누적되지 않습니다. **옵시디언은 강력하지만 LLM 이 1급 시민이 아닙니다** — 채팅이 사이드 패널에 붙어 있을 뿐, 시스템의 컴파일러가 아닙니다. **Claude Code/Cursor 같은 코딩 에이전트는 코드에 묶여 있어** 비-테크 사용자가 문서 워크플로우에 끌어쓸 수 없습니다. **기업은 자체 호스팅·감사·권한이 필요한데** 마크다운 파일만으론 부족합니다. **데스크톱과 브라우저에서 동일한 경험이 필요한데** 대부분의 도구는 한쪽만 잘합니다.

---

## Solution · 해결 — Compounding 3 axes

```
        (자라남 / Grow)
        ┌──────── ingest ─────────┐
        │                          ▼
   raw 자료 ──────────────────▶ wiki 노드들
                                   │
                  (모양 잡기 / Shape)
              curate ◀──────────────┤   (사람이 직접 쓰기 / Write)
              │     │                │     ▲
              │     ▼                │     │  draft / improve
              │  카테고리·분할·이동·인덱스   │
              └────────── ask ─────────────┘
                  (꺼내 쓰기 + 답이 새 페이지로 누적 / Use & accumulate)
```

**Karpathy 의 LLM Wiki 비전을 1:1 로 구현한 첫 번째 제품입니다.** ingest 가 자료를 들이고, curate 가 모양을 잡고, ask 가 꺼내 쓰며 답을 다시 누적시킵니다. 이 셋이 컴파운딩 엔진. draft / improve 는 사용자가 직접 쓸 때의 워드프로세서 동선 — 비-테크 사용자(P-STARTUP) 흡수를 위해 코어에 함께 둡니다.

---

## Core 5 Verbs · 코어 5개 동사

| Verb | One-line | When |
|---|---|---|
| `/ingest` | 자료를 들여 wiki 가 자라남 (한 raw → 3~10 노드) | 매 자료 도착 |
| `/curate` | 자라난 wiki 의 모양을 잡음 — 새 카테고리·분할/합치기·고아 입양 | 누적 임계점·명시 호출 |
| `/ask` | 자연어 질문 → 검색+답변, 답은 새 wiki 페이지로 자동 저장 | 매일 (compounding) |
| `/draft` | 빈 문서면 개요+초안, 선택 영역이면 확장 (사용자가 가장 먼저 누르는 버튼) | 글쓰기 시작 |
| `/improve` | 톤·길이·간결성 개선 (3 옵션 diff 비교) | 다듬기 직전 |

> **확장은 1급 시민** — 코어 외 모든 동사는 코드 0줄로 추가 가능 (Skill / 마크다운 정의 에이전트 / 플러그인 / MCP 서버, 4단계 경로).

---

## Personas · 4개 페르소나, 4개 다른 1차 동사

| | 페르소나 | 1차 동사 | 진입 가치 |
|---|---|---|---|
| **P-IND** | 개인 연구자 (Karpathy 스타일) | `ingest` · `ask` | wiki 가 자란다 |
| **P-STARTUP** | 10–50인 스타트업 (PM/디자이너) | `draft` · `improve` | 글쓰기 + 결정 추적 |
| **P-EDU** | 대학·학교 (강사/학생) | `ingest` · `curate` | 학기 자료 정리 |
| **P-ENT** | 중견·대기업 부서 | `curate` · `ask` · `import` | **사규·정책 망의 일관성 자동 유지** |

**P-ENT 의 진짜 가치는 RBAC 이 아니라 `curate`** — 사규 개정 시 영향받는 다른 정책을 자동 추적합니다. RBAC/감사는 그 가치를 *전달 가능하게* 만드는 조건이지, 가치 자체가 아닙니다.

---

## Differentiation · 차별화

| | VelugaLore | Obsidian | Notion AI | Claude Code |
|---|---|---|---|---|
| LLM 위치 | 1급 시민 (시스템 컴파일러) | 사이드 패널 플러그인 | 채팅 인터페이스 | 코드베이스 한정 |
| 데이터 진실 근원 | **Postgres** (검색·인덱스·RLS·감사) | 파일 only | 자체 클라우드 only | 파일 only |
| Compounding 메커니즘 | **ingest + curate + ask** (자동) | 수동 | 없음 | 코드 review |
| 정보 아키텍처 진화 | **`curate` 가 자동** | 사람이 직접 | 없음 | n/a |
| 데스크톱 / 브라우저 | 둘 다 1급 (같은 데몬) | 데스크톱 only | 브라우저 only | 데스크톱 only |
| 확장 | 코드 0줄로 추가 (T1~T4) | TypeScript 플러그인 | 폐쇄 | TypeScript 플러그인 |
| RBAC + 감사 | 1급 (Postgres RLS) | 없음 | 부분 | 없음 |
| **첫 도입 시나리오** | **사규/매뉴얼 zip 1:1 import** | 빈 vault 시작 | 빈 워크스페이스 | git repo |

VelugaLore 는 **옵시디언의 손맛 + Claude Code 의 슬래시 명령 + Postgres 의 신뢰성 + pydantic-ai 의 타입 안전 멀티 에이전트** 4가지를 한 데스크톱 앱에 맞춘 첫 번째 제품입니다.

---

## Model & Tech · 모델·기술

**LLM 3종 동봉** — OpenAI · Anthropic · Gemini. 사용자 workspace 별 디폴트 + 에이전트별 오버라이드. 자체 모델 학습 없음, provider 추상화는 pydantic-ai.

**Embedding** — OpenAI `text-embedding-3-small` (1536d, Matryoshka 1024d truncate 옵션). v1.5+ 에서 로컬 `bge-m3-onnx` (data sovereignty).

**스택** — TypeScript 모노레포 (turborepo+pnpm) · Tauri 2.x (데스크톱) · Next.js 15 (웹) · CodeMirror 6 + ProseMirror (에디터) · PostgreSQL 16 + pgvector + pg_trgm · pydantic-ai (Python 워커) · OpenTelemetry · Pydantic Logfire.

**확장 표면** — Skill (마크다운 한 장) → 마크다운 정의 에이전트 (코드 0줄) → 플러그인 (.weki-plugin) → MCP 서버. 모두 SemVer 안정 표면.

---

## Roadmap · 로드맵 (24주, v1 GA)

| | 주 | 가치 | 게이트 |
|---|---|---|---|
| **M0 · Foundation** | W1–W3 | 모노레포·DB·셸 부트 | CI 그린, RLS 통합테스트 100% |
| **M1 · Editor & Draft** | W4–W6 | "/draft 로 글쓰기 시작" | 신규 사용자 5분 내 성공 ≥ 80% |
| **M2 · Improve · Ask · Ingest** | W7–W10 | compounding 루프 *전·후반부* 개통 | ingest fan-out 3~10, ask 정확도 ≥ 0.8 |
| **M2.5 · Curate** | W10–W12 | wiki 모양 잡기 (Karpathy 비전 핵심) | curate 제안 정확도 ≥ 0.7, 백링크 깨짐 0 |
| **M3 · Workspace Ops & Team** | W13–W16 | 검색·이력·LSP + 팀 모드 | 1만노드 검색 p50 ≤ 500ms, RBAC 위반 0 |
| **M4 · Extensibility** | W17–W20 | 사용자가 자기 에이전트 추가 (T1~T4) | SKILL.md 10분 내 동작, 플러그인 30분 |
| **M5 · GA** | W21–W24 | 회귀·비용·서명 + 1st-party 묶음 출시 | evals 99%, 4 OS 서명, marketplace 8+ 에이전트 |

---

## Validation · 가설 검증 게이트 5개

| | 가설 | 검증 시점 | 성공 기준 |
|---|---|---|---|
| H1 | 코어 draft+improve 가 글쓰기 시작 비용을 낮춘다 | M1 후 5인 사용성 | NASA-TLX -20%, 첫 문단 ≤ 2분 |
| H2 | ingest fan-out 이 만족도 1순위 견인 | M2 후 NPS·인터뷰 | NPS ≥ 30, "wiki 자라난다" 자발 언급 ≥ 3/5 |
| H3 | 데스크톱 우선이 옳다 | M3 종료 | desktop:web ≥ 7:3 |
| H4 | curate 가 P-ENT 도입 결정 1위 | M2.5 후 P-ENT 베타 3 조직 | 의사결정자 인터뷰 2/3 가 curate 1순위 인용 |
| H5 | 확장 4단계가 진짜 사용된다 | M4·M5 후 90일 | T1 ≥ 30%, T3 외부 플러그인 ≥ 5 |

각 가설마다 *실패 시 분기* 가 PRD §16.2 에 명시 — 가설이 틀렸을 때 어디로 갈지가 미리 결정되어 있습니다.

---

## Top Risks · 주요 위험

- **R3 사용자가 옵시디언을 안 떠난다** → "Obsidian compatibility mode" (같은 폴더 둘 다 마운트) + Companion 플러그인 + 차별화 강화 (curate, compounding /ask)
- **R4 LLM 비용이 ARPU 초과** → BYO 키 + 가성비 모델 default + per-agent 한도 + 컴파운딩 캐싱(qa 페이지 재사용) + 로컬 임베딩 옵션
- **R7 curate 자동 제안의 거절률 ↑** → 거절률 > 30% 시 자동 트리거 비활성, negative training, AGENTS.md 강화

---

## Architectural Decisions · 핵심 결정 13개

> 모든 결정은 PRD §17.3 에 *왜 그렇게 정했는지* 함께 명시 — 향후 흔들리지 않도록.

D1 Postgres 가 진실 근원, 파일은 미러 · D2 Tauri > Electron · D3 Python 워커 분리 · D4 Patch is the only currency · D5 v1 그래프 = 단순 links, triples 차후 · D6 opencode = 레퍼런스 (코드 의존 옵션) · D7 코어 5개 (Karpathy 3축 + 직접 쓰기 2개) · D8 확장 인프라 우선 · D9 ingest ≠ curate · D10 curate 는 본문 안 건드림 · D11 자동화 정책은 opencode 의 *반대* (approval 우선) · D12 AGENTS.md 형식만 차용 · D13 LLM 3 provider + OpenAI embedding 우선

---

## License · 라이선스

- 앱: **Apache-2.0**
- 플러그인 SDK · 예제: **MIT**
- 1st-party 확장 에이전트: **MIT**

영감 — Andrej Karpathy의 [LLM Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f); [anomalyco/opencode](https://github.com/anomalyco/opencode) (MIT); [pydantic/pydantic-ai](https://github.com/pydantic/pydantic-ai) (MIT); Obsidian (proprietary, 영감만).

---

## What we're looking for · 함께할 분

- **Founding engineer (TypeScript / Rust / Tauri)** — desktop core, agent-server, editor.
- **Founding engineer (Python / pydantic-ai)** — 코어 5개 + 시스템 에이전트 워커.
- **Founding designer** — 비-테크 사용자(P-EDU/P-ENT) UX 깊이 이해.
- **Beta partners** — 사규·매뉴얼 import 시나리오 검증할 P-ENT 3개 조직, 학기 운영 P-EDU, Karpathy 스타일 P-IND.

---

**Contact**: sylee@veluga.io · [GitHub repo (private until M0)](https://github.com/veluga/velugalore)

> *"Obsidian is the IDE; the LLM is the programmer; the wiki is the codebase."*  — Karpathy

— *VelugaLore — turning every drop of knowledge into a compounding asset.*
