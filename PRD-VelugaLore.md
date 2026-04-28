---
title: "VelugaLore — AI-Native Document & Knowledge Workspace PRD"
subtitle: "AI 네이티브 문서·지식 워크스페이스 제품 요구사항 정의서"
version: 0.1.1-draft
status: Draft (implementation-ready for AI coding agents)
owner: "@sylee (Veluga)"
last_updated: 2026-04-26

# 제품의 1차 사용자 — Who the *product* is for
product_primary_users:
  - 기업 부서 (정책·제안서·온보딩 문서)
  - 학교·대학 (강의·교재·과제 피드백)
  - 스타트업 팀 (PRD·RFD·메모)
  - 개인 연구자/지식노동자 (연구노트·블로그·아카이브)
product_primary_users_note: |
  비-테크 사용자가 다수다. UX 의사결정은 항상 비-테크 사용자 우선,
  기술 노출(스키마·CLI·플러그인 등)은 옵션·기본 비활성으로.

# PRD 문서의 1차 독자 — Who reads *this PRD*
prd_primary_readers:
  - AI coding agents (Claude Code · Codex · Cursor · VS Code Copilot) — 구현 주체
  - Engineering team — 구현·리뷰
  - Founding PM/Designer — 가치·UX 의사결정 검증

inspirations:
  - Andrej Karpathy, "LLM Wiki" (gist 442a6bf...)
  - anomalyco/opencode (open-source coding agent)
  - pydantic/pydantic-ai (GenAI agent framework)
  - Obsidian (markdown-first knowledge editor)
license_intent: Apache-2.0 for app, plugins MIT
---

> **Legacy backup notice (2026-04-28)**  
> 이 단일 파일은 PRD 분리 이전 백업입니다. 최신 구현 계획과 결정은 `PRD/` 폴더의 섹션별 문서를 기준으로 합니다. 특히 S-08.6 real LLM provider runtime, D13 Gemini 기본값(`gemini-2.5-flash-lite`), `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`GOOGLE_API_KEY` 3종 preflight 정책은 `PRD/04-architecture.md`, `PRD/13-implementation-guide.md`, `PRD/18-implementation-handoffs.md`를 보세요.

> **두 청중을 분리한다 / Two audiences, kept distinct**
>
> 1. **제품의 1차 사용자**는 비-테크 사용자다 — 기업의 정책·제안서 담당자, 학교의 강사·조교, 스타트업의 PM/디자이너, 개인 연구자. 옵시디언처럼 "그냥 글이 쓰이는" 손맛이 1순위이고, 모든 기술 노출(스키마·CLI·플러그인 등)은 기본값에서 보이지 않아야 한다. UX 트레이드오프는 항상 이쪽을 따른다.
> 2. **이 PRD 문서의 1차 독자**는 AI 코딩 에이전트(Claude Code · Codex · Cursor · VS Code Copilot)와 엔지니어링 팀이다. 즉 PRD는 "구현용"으로 쓰여져 있고, 그래서 식별자·스키마·API·타입·코드는 영문, 본문은 한국어로 적었다. 에이전트는 §13 "구현 가이드" 부터 읽고 슬라이스를 선택한 뒤, 그 슬라이스가 참조하는 절만 펼쳐 읽으면 된다.
>
> *Audiences are separated:* the **product** is for non-technical knowledge workers in enterprises, schools, startups, and for individuals; **this document** is written to be implemented by AI coding agents and engineers. When in doubt about UX, optimize for the non-technical end user; when in doubt about structure of this PRD, optimize for an AI coding agent picking a slice in §13.

---

# 1. 비전과 문제정의 / Vision & Problem Statement

## 1.1 비전 / Vision

**사용자(비-테크 포함)에게 보이는 모습 — End-user view**

> 자료를 폴더에 떨어뜨리면 문서가 자동으로 정리되어 쌓이고, 글을 쓰는 도중 `/` 한 번이면 "개요 잡아줘", "쉽게 다듬어줘", "관련 노트랑 연결해줘" 같은 일을 한 번에 처리한다. 옵시디언처럼 노트가 서로 링크로 이어지지만, 노트를 정리하는 일은 사람이 하지 않아도 된다.

**구현하는 쪽에게 보이는 모습 — Implementation view (for AI coding agents · engineers)**

> Obsidian-shaped editor where the LLM is a compiler, agents are slash commands, Postgres is the canonical store — desktop first, browser-equivalent later. 자료=raw, 노트=wiki, 작성 중 호출되는 모든 에이전트의 출력은 `Patch` 단일 통화로 표현된다.

## 1.2 해결하려는 문제 / Problem

| # | 문제 (Korean) | Problem (English) |
|---|---|---|
| P1 | RAG 챗봇은 매번 처음부터 답을 합성한다. 누적되지 않는다. | Today's RAG chats re-derive answers per query; knowledge does not compound. |
| P2 | 옵시디언은 강력하지만 LLM이 1급 시민이 아니다. 플러그인은 chat 사이드패널 수준. | Obsidian is strong but treats LLMs as a side panel, not as the system's compiler. |
| P3 | Claude Code/Cursor 같은 에이전트는 "코드"에 묶여 있어 비개발자가 문서 워크플로우에 끌어쓰기 어렵다. | Coding agents are coupled to code repos; non-engineers can't reuse the same agent UX for documents. |
| P4 | 기업은 자체 호스팅·감사 로그·권한이 필요한데, 마크다운 파일만으론 부족하다. | Enterprises need RBAC, audit logs, and a queryable store — markdown files alone are not enough. |
| P5 | 데스크톱과 브라우저에서 동일한 편집 경험이 필요한데, 대부분의 도구는 한쪽만 잘한다. | Same editor must be excellent on desktop *and* browser; most tools are good at only one. |

## 1.3 비-목표 / Non-goals (v1)

- 실시간 멀티커서 동시편집(Yjs/CRDT) 은 v2 이상으로 연기. v1 은 "동시편집 안전한 단일 작성자 + presence" 까지.
- 자체 LLM 학습/파인튜닝 파이프라인 제공 안 함. 모델은 외부 provider 또는 self-hosted endpoint 에 위임.
- 모바일 네이티브 앱 v1 미포함. 브라우저 PWA 로 모바일을 커버.
- 자체 백업 클라우드 운영 안 함. S3/R2 호환 버킷을 사용자/조직이 가져옴(BYO bucket).

## 1.4 한 문장 차별화 / One-line wedge

> 옵시디언의 손맛 + Claude Code 의 슬래시 명령 + Postgres 의 신뢰성 + pydantic-ai 의 타입 안전 멀티 에이전트, 4가지를 한 데스크톱 앱에 맞춘 첫 번째 제품.

---

# 2. 페르소나와 유스케이스 / Personas & Use Cases

## 2.1 1차 페르소나 / Primary Personas

| 코드 | 페르소나 | 핵심 잡 (JTBD) | 성공 지표 |
|---|---|---|---|
| **P-IND** | 개인 연구자/지식 노동자 (Karpathy 스타일) | 매일 들어오는 논문·아티클·노트를 영구 누적 지식으로 만든다 | 30일 내 wiki 페이지 200+, 재방문/주 ≥ 4 |
| **P-STARTUP** | 10–50인 스타트업 (PM/디자이너/엔지니어 혼재) | PRD/RFD/메모를 같은 에디터에서 쓰고, 에이전트가 일관성 검토 | 팀당 활성 문서 ≥ 100, /Review 사용 ≥ 5/문서 |
| **P-EDU** | 대학·학교 (강사/조교/학생) | 강의자료·교재·과제 피드백을 wiki 화 | 과목당 노드 ≥ 50, 학기말 누적 그래프 시각화 |
| **P-ENT** | 중견·대기업 부서 (감사·권한 필수) | 제안서·정책문서·온보딩 가이드를 RBAC 으로 관리 | RBAC 위반 0, 감사 export ≤ 5분 |

## 2.2 핵심 유스케이스 / Top Use Cases

1. **U1 · "기존 문서 대량 업로드(Import)"** — 사규집·업무매뉴얼·온보딩가이드·기존 정책문서(`.docx`/`.md`/Notion·Confluence export/`.pdf`-as-document) 를 폴더 단위로 드롭 → `ImportAgent` 가 폴더 구조·헤딩 트리·내부 링크·첨부·표를 보존한 채 **편집 가능한 wiki 노드** 로 1:1 이관. 이관 후엔 사용자가 직접 편집하거나 `/Review`/`/Simplify`/`/Crosslink` 의 대상이 된다. **이관 비용이 0에 수렴해야 도입 의사결정이 떨어진다.** 이 흐름이 P-ENT/P-EDU 의 1차 진입점이다.
2. **U2 · "원자료 ingest → 파생 wiki"** — PDF 논문·웹 아티클·이미지를 `inbox/` 에 드롭 → `IngestAgent` 가 *파생* wiki 페이지(요약/엔티티/개념)를 생성하고 인덱스 갱신. 원자료는 `raw_sources` 에 불변 보관. (U1 과의 차이: U1=기존 wiki 자체, U2=원천에서 새 wiki 파생.)
3. **U3 · "/draft 로 글 시작"** — 빈 문서에서 `/draft 5장짜리 정부 R&D 제안서 개요` 입력 → 코어 `DraftAgent` 가 섹션 트리·초안을 본문에 삽입. (더 구조적인 개요 트리가 필요하면 1st-party 확장 `/plan` 을 활성화.)
4. **U4 · "/improve 로 다듬기"** — 사내 정책문서 일부 선택 → 코어 `ImproveAgent` 가 세 가지 톤 옵션을 diff 로 제안. (특정 도메인 톤은 1st-party 확장 `/simplify` 또는 사용자 정의 Skill 로 보강.)
5. **U5 · "/Crosslink 그래프 보강"** — 새 페이지 작성 후 `CrosslinkAgent` 가 [[wiki link]] 삽입 후보를 인라인으로 제안. 사규·매뉴얼 임포트 직후 자동 실행해 회사 전체 문서 그래프를 한 번에 점등.
6. **U6 · "/Review 일관성 점검"** — PR 머지 전, 또는 사규 개정 시 `ReviewAgent` 가 사실관계·용어집·다른 정책 문서와의 모순을 확인.
7. **U7 · "기존 문서 업데이트 + 변경이력 기록"** — 임포트된 사규에 사용자가 변경을 가하면 `doc_versions` 에 인간/에이전트 출처가 기록되고, `ReviewAgent` 가 영향받는 다른 문서 후보를 제안.
8. **U8 · "Daily compile"** — 야간 잡이 raw inbox 를 컴파일하고, log.md 에 ingest/import 기록을 추가.

> **Ingest vs Import 한 줄 요약 — One-line distinction**
>
> *Ingest 는 원천 → 새 wiki 페이지를 파생한다. 원본은 read-only.*
> *Import 는 기존 편집 자산 → wiki 노드 그 자체. 이관 후 사용자가 직접 편집한다.*
> 두 경로는 코드·권한·UX·테이블 분리되어 있다(§5, §8.2).

## 2.3 사용자 여정 (개인) / User Journey (P-IND)

```
첫 실행 → onboarding 위저드(보관소 폴더 선택, Postgres 모드 선택[local|self-hosted|cloud], LLM provider 선택) →
  inbox/ 에 첫 PDF 드롭 → IngestAgent 가 3개 wiki 페이지 생성 → graph view 가 처음으로 점등 →
  사용자는 /Ask 로 "이 논문이 내 기존 노트와 어떻게 연결되지?" → 답은 새 wiki 페이지로 저장 → 컴파운딩 시작
```

---

# 3. 컨셉 모델 / Conceptual Model

## 3.1 Karpathy LLM Wiki 매핑 / Mapping the LLM Wiki idea

Karpathy의 비유 — *"Obsidian is the IDE; the LLM is the programmer; the wiki is the codebase."* — 를 VelugaLore 에서 다음과 같이 구체화한다.

| LLM Wiki 개념 | VelugaLore 구현체 |
|---|---|
| `raw/` (불변 소스) | `vault/raw/` 디렉토리 + Postgres `raw_sources` 테이블. 에이전트는 read-only. |
| `wiki/` (LLM 산출물) | `vault/wiki/` 디렉토리 + Postgres `documents` 테이블. 에이전트만 쓰기 가능 (사용자도 직접 편집 가능, 모드별 워크플로우 §11.2). |
| `index.md` | `documents WHERE kind='index'` + 자동 생성·갱신. graph view 의 노드 카탈로그. |
| `log.md` | `documents WHERE kind='log'`, append-only. 모든 에이전트 실행이 prefix `## [YYYY-MM-DD HH:MM] <verb> | <subject>` 로 자기 기록. |
| `[[wiki link]]` | 에디터 기본 문법. Postgres `links` 테이블에 정규화 저장. |
| Frontmatter (YAML) | `documents.frontmatter JSONB` 컬럼 (type, sources, related, confidence...). |
| "LLM as compiler" | 에이전트 그래프 = 빌드 그래프. Incremental: 변경된 raw/와 dirty wiki 만 재컴파일. |
| Schema 파일 (CLAUDE.md, AGENTS.md) | `vault/.weki/AGENTS.md` (사람이 쓰는 에이전트 시스템 프롬프트). Git 추적. |

## 3.2 핵심 객체 / Core Entities

```
RawSource ─┐
           │ ingested_into
           ▼
        Document ◀──── EditOp (CRDT 시퀀스, v2)
           │
           │ has_link
           ▼
       Document (other)
           │
           │ tagged_with
           ▼
          Tag

Agent ── runs ──▶ AgentRun ── produces ──▶ Patch ── applies_to ──▶ Document
                                  │
                                  └── reads ──▶ {RawSource | Document}
```

## 3.3 컴파일러 메타포의 작동 방식 / How "LLM as compiler" actually works

1. **Trigger** — 파일 시스템 watcher 또는 `weki compile --since <ts>` 가 dirty 집합 산출.
2. **Plan** — 오케스트레이터(pydantic-ai `Agent[CompileDeps, CompilePlan]`) 가 ingest/relink/refresh 작업 DAG 를 산출.
3. **Execute** — 각 에이전트가 자기 도구만 호출(권한 분리). 결과는 항상 `Patch` 로 표현 (텍스트 직접 쓰지 않음).
4. **Apply** — 메인 프로세스가 patch 를 검증·적용·로그. 에이전트는 적용 권한이 없다. (human-in-the-loop 게이트, §11.4)
5. **Index** — `index.md` 와 `log.md` 가 마지막에 자동 갱신.

---

# 4. 시스템 아키텍처 / System Architecture

## 4.1 큰 그림 / High-level diagram

```
┌──────────────────────────── Desktop Shell (Tauri) ───────────────────────────┐
│  ┌──────────────────────────  Renderer (TypeScript/React)  ────────────────┐ │
│  │  Editor (CodeMirror 6 + ProseMirror bridge)  │  Graph view (sigma.js)  │ │
│  │  Command palette (slash menu)                │  Side panels             │ │
│  └────────────────────────────────────┬─────────────────────────────────────┘ │
│                              IPC (Tauri commands + events, JSON-RPC)           │
│  ┌────────────────────────────── Core (Rust)  ────────────────────────────┐  │
│  │ Vault FS watcher · Patch applier · Auth · Crypto · Plugin host · LSP   │  │
│  └────────────────────────────────┬───────────────────────────────────────┘  │
│                                   │ Unix domain socket / TCP loopback         │
│  ┌──────────────── Agent Daemon (TypeScript, opencode-derived) ──────────┐   │
│  │ HTTP+SSE server · Session/run mgr · Tool runtime · MCP host           │   │
│  └────────────────────────────────┬───────────────────────────────────────┘   │
│                                   │ stdin/stdout JSON-RPC                       │
│  ┌──────────── Agent Workers (Python, pydantic-ai) ────────────────────┐     │
│  │ PlanAgent · SimplifyAgent · IngestAgent · CrosslinkAgent · ...     │     │
│  └────────────────────────────────┬───────────────────────────────────┘     │
└───────────────────────────────────┼──────────────────────────────────────────┘
                                    │
                          ┌─────────┴──────────┐
                          │  PostgreSQL 16     │  ← canonical store (local dev: Postgres.app/Postgres-in-process via pglite for browser)
                          │  pgvector · pg_trgm│
                          └────────────────────┘
                                    │
                          ┌─────────┴──────────┐
                          │  Object store (S3) │  ← raw blobs, attachments
                          └────────────────────┘
```

## 4.2 데스크톱 vs 브라우저 / Desktop vs Browser

| 측면 | Desktop (v1) | Browser (v1.5) |
|---|---|---|
| Shell | Tauri 2.x (Rust core, WebView2/WKWebView) | Next.js 15 + React 19 |
| Vault FS | OS 파일시스템 직접 마운트 | OPFS + IndexedDB 캐시 |
| Postgres | local Postgres 또는 self-hosted | self-hosted/cloud only (브라우저는 SQL 직접 연결 안 함) |
| Agent daemon | 같은 머신 자식 프로세스 | 서버측 워커 풀 (Kubernetes job) |
| LSP | 데스크톱만 (markdown LSP, vale, ltex) | 미지원 |
| 오프라인 | 완전 오프라인 가능(local LLM 옵션) | 부분 오프라인 (PWA 캐시) |
| 핫키 | 글로벌 단축키, 트레이 | 브라우저 단축키 |

원칙: **두 환경의 데이터·API 표면은 동일**(같은 OpenAPI). UI 만 본질적으로 갈라진다.

## 4.3 opencode 의 위치 — 레퍼런스이지 의존성이 아님 / opencode as a design reference, not a dependency

> **결정**: opencode 는 **설계 레퍼런스** 로 다룬다 — 코드 벤더링은 *옵션* 이며 v1 GA 의 critical path 에 없다. 우리는 opencode 가 코딩 도메인에서 검증한 **패턴** 을 이해하고 같은 가치(탐색·정밀 편집·변경 추적·세션·확장)를 vault 에서 자체 구현으로 재현한다.

이렇게 정한 이유:

- **라이선스/업스트림 추적 부담 회피** — 코드 의존을 핵심 경로에 두면 출시 일정이 업스트림 일정에 묶인다. 옵션 차용(§4.3.2)을 시도하더라도 critical path 에는 두지 않는다.
- **도메인 차이** — 코드 도구(Bash, code interpreter)는 문서 워크스페이스에서 위협 표면일 뿐. vault 환경에 맞는 도구만 들이는 편이 깨끗하다.
- **자체 구현이 작다** — 클라이언트-서버 분리, 슬래시 라우팅, 도구 화이트리스트, plan/build 모드 같은 패턴은 각각 수십~수백 줄. pydantic-ai 위에서 자체 구현하는 게 보수 비용이 더 낮다.

### 4.3.1 패턴 차용 매트릭스 / Pattern adoption matrix

| opencode 의 설계 패턴 | VelugaLore 가 흡수하는 가치 (문서 도메인) | v1 구현 옵션 |
|---|---|---|
| 클라이언트-서버 분리 (TUI 는 한 클라이언트일 뿐) | 데스크톱·브라우저·CLI 가 같은 데몬을 다른 클라이언트로 사용 | **자체 구현** — 우리 데몬은 TS, HTTP+SSE 자체. opencode 코드 의존 없음 |
| 슬래시 라우팅 (`/<verb> [args]`) | 동일 문법으로 에디터에 자연스러운 호출 표면 | **자체 구현** — `parseSlash` 는 §6.3 에 컨트랙트 명시, 작은 순수 함수 |
| AGENTS.md 컨벤션 (사람이 쓰는 컨텍스트 파일) | `vault/.weki/AGENTS.md` 에 회사별 문서 규칙 → 모든 에이전트 자동 참조 | **컨벤션 차용** — 형식만 호환, 코드 의존 없음 |
| plan ↔ build 모드 토글 | "분석 ↔ 편집" 모드 노출(§7.6), 비-테크 사용자에게도 안전성 직관 | **자체 구현** |
| 도구 화이트리스트 (per-agent capability) | 위험 도구는 approval queue 통과 (§11.4) | **자체 구현** — pydantic-ai `@agent.tool` 로 강제 |
| Grep/Glob/Edit/MultiEdit 류 도구 셋 | vault 전체 검색·정밀 편집·일괄 리팩터링 | **자체 구현** — `search_vault`/`replace_range`/`refactor` 로 명명, 코드 도구는 제외 |
| 세션·런 관리자 (멀티턴 컨텍스트 누적) | "사규 v2.3 개정" 1세션이 수십 명령을 묶음 | **자체 구현** — Postgres `agent_runs.parent_run_id` 로 영속화 |
| MCP 호스트 | 사내 HRIS/ERP/Confluence/Slack 을 도구로 노출 | **표준 차용** — MCP 표준 자체를 따르며 opencode 코드 의존 없음 |
| LSP 통합 (코드의 빨간 밑줄) | 깨진 `[[wiki link]]`·고아 노드·용어 불일치 진단 | **자체 구현** — 자체 markdown LSP, opencode LSP 통합부 의존 없음 |

### 4.3.2 옵션: 코드 차용 가능 지점 / Optional vendoring touchpoints

코드를 직접 가져오는 것이 *명확한* 시간 절약일 때만 한정 차용. 매주 rebase 잡 비용을 감수할 가치가 있을 때만.

| 후보 | 차용 검토 시점 | 빠지면 어떻게? |
|---|---|---|
| `sdk-server` (HTTP+SSE 서버 골격) | M1 직전, 자체 구현이 1주 이상 걸리면 | Hono + SSE 자체 — 며칠 |
| 슬래시 자동완성 UI 컴포넌트 | M1 | CodeMirror 6 hint 확장 자체 |
| MCP 호스트 구현 | M2 | `@modelcontextprotocol/sdk` 직접 사용 |
| LSP 통합 어댑터 | M2 | `vscode-languageserver` 직접 사용 |

**판정 규칙**: "자체 구현 1주 < 차용 + rebase 평생 비용" 이면 자체 구현. 보통 자체 구현이 이긴다.

### 4.3.3 변경 추적 / Change tracking

vault 는 git 으로 미러된다(옵션, default ON). git 은 **두 번째 진실 근원** 으로 쓰지 않고, **export·diff·blame UI 의 백엔드** 로만 쓴다 — 진실 근원은 Postgres (D1, §17.3).

- 모든 patch 적용은 자동 git commit. 메시지 표준: `agent:<id> run:<run_id> · <summary>` 또는 `human:<email> · <summary>`.
- "이 import_run rollback" → 프로그램이 inverse patch → 새 commit (revert).
- 깃 푸시는 사용자 토큰 BYO. VelugaLore 는 자체 호스팅 git 운영 안 함.

### 4.3.4 비-목표 / Non-goals

- 코드 실행 도구(Bash, code interpreter) 노출 금지.
- vault 외 파일 시스템 임의 접근 차단 — 모든 read 도구는 vault 루트로 chroot.
- opencode 의 모델 라우팅(Zen) 사용 안 함 — provider 추상화는 pydantic-ai.


## 4.4 pydantic-ai 활용 전략 / Reusing pydantic-ai

- 모든 전담 에이전트는 `pydantic_ai.Agent[Deps, Output]` 으로 구현.
- `Output` 은 항상 Pydantic `BaseModel` (i.e. 항상 검증된 구조화 출력 → patch 의 입력으로 쓸 수 있다).
- `RunContext` 의 `deps` 에 vault, postgres pool, audit logger 주입.
- `@agent.tool` 로 등록되는 도구는 §10 "에이전트 도구 카탈로그" 의 화이트리스트 안에서만.
- `pydantic_graph` 로 컴파일 파이프라인의 다단계 의존성 표현 (예: ingest → crosslink → reindex).
- Human-in-the-loop tool approval 은 patch 적용 게이트에 매핑 (§11.4).

---

# 5. 에이전트 카탈로그 / Agent Catalog

> **설계 원칙 — 코어는 작게, 확장은 1급 / Small core, first-class extensibility**
>
> v1 GA 동봉 코어는 일반 문서 작성에서 **반드시 필요한 동사** 만 둔다. 그 외 모든 동사는 **확장 슬롯**(§10) 으로 — 사용자/조직이 자기 도메인 어휘에 맞게 *덧붙이는* 구조다. VelugaLore 의 가치는 "에이전트가 많다" 가 아니라 "에이전트를 *어떻게* 추가하는지가 직관적이다" 에서 나온다.
>
> 모든 에이전트는 (1) 한 가지 동사, (2) 항상 `Patch` 또는 `ReadOnlyAnswer` 만 반환, (3) 자체 시스템 프롬프트를 `vault/.weki/agents/<id>.md` 에 둔다.

## 5.1 v1 코어 에이전트 (3개) / Core agents shipped in v1

| ID | 동사 | 일반 문서 작성에서의 역할 | 입력 | 출력 | 권한 |
|---|---|---|---|---|---|
| `draft` | "초안 만들기" | 빈 문서면 개요+초안, 선택 영역이면 그 영역의 초안 확장. (일반 사용자가 가장 먼저 누르는 버튼) | selection 또는 doc id + 의도 | `Patch{ops:[insert_section_tree, replace_range, append_paragraph]}` | read |
| `improve` | "다듬기" | 톤·길이·문법·간결성 개선. 옵션 3개를 diff 로 비교 후 적용. | selection | `Patch{ops:[replace_range × 1..3 alternatives]}` | read |
| `ask` | "wiki 에 질문" | 자연어 질문 → 검색 + 답변. 답변은 새 wiki 페이지(`kind='qa'`)로 자동 저장(컴파운딩) | natural language query | `Patch{ops:[create_doc(kind=qa)]}` + `ReadOnlyAnswer` | read+create |

> **3개로 줄인 이유** — 비-테크 사용자에게 명령이 많을수록 첫 사용 비용이 올라간다. "초안→다듬기→질문" 3단계는 워드프로세서 사용 경험으로 이미 직관적이다. 더 정교한 동사(요약/번역/인용/슬라이드 등)는 사용자가 *필요할 때* 추가한다.

## 5.2 시스템 작업 (에이전트가 아닌 vault 운영 기능) / System operations

이들은 슬래시 명령으로 노출되지만, "에이전트" 라기보다 **vault 운영 작업** 이다. 코어와 별도로 시스템 기본 기능으로 동봉.

| ID | 역할 |
|---|---|
| `import` | 기존 문서(docx/md/Notion·Confluence export 등) → wiki 노드 1:1 이관 (§2.2 U1, §8.2 `import_runs`) |
| `ingest` | 원자료(PDF/URL/이미지) → 파생 wiki 페이지 (§2.2 U2) |
| `find` | vault 전체 검색 (literal/regex/embedding 3-way) |
| `diff` / `blame` / `revert` | 변경 이력 조회/추적/되돌리기 (§4.3.3) |
| `lint` | 깨진 링크·고아 노드·중복 노드 검사 |
| `compile` | 야간 incremental 작업 오케스트레이터 (코어 + 활성 확장 에이전트를 dirty 집합에 적용) |

## 5.3 1st-party 확장 에이전트 (기본 marketplace 동봉, 사용자가 활성화) / First-party extension agents

> 출시 시점에 "공식 marketplace 의 권장 묶음" 으로 제공. 기본 비활성화이며, 사용자가 한 번 켜면 슬래시 메뉴에 합류. 각각은 `.weki-plugin` 또는 `vault/.weki/agents/<id>.md` 형태로 배포되어 코어와 같은 메커니즘으로 동작한다 — 즉 **사용자가 자기 에이전트를 만들 때의 본보기** 가 된다.

| ID | 동사 | 비고 |
|---|---|---|
| `plan` | 섹션 트리·체크리스트 (드래프트 보다 구조적) | `draft` 의 상위 옵션 |
| `expand` | 짧은 노트를 풀어 쓰기 | `draft` 의 좁은 변형 |
| `simplify` | 톤·길이 조정 (3 옵션) | `improve` 의 좁은 변형 |
| `crosslink` | `[[wiki link]]` 후보 제안 | 그래프 보강 |
| `review` | 사실/용어/스키마 일관성 검사 | 머지 전 게이트 |
| `summarize` | 요약 페이지 생성 | |
| `outline` | 긴 문서 목차 자동 갱신 | |
| `translate` | KO↔EN 등 단락 번역 | |
| `cite` | 인용 자동 삽입·검증 | |
| `slides` | Marp 슬라이드 초안 | |
| `diagram` | mermaid 코드 삽입 | |
| `refactor` | vault 전반 용어/표현 일괄 변경 (MultiEdit 류) | 강력하지만 위험 → approval 필수 |

## 5.4 사용자/조직 맞춤 에이전트 / User-defined & org-specific agents

§10 의 4단계 확장 경로(가벼움→무거움) 중 하나로 추가:

1. **Skill** (`vault/.weki/skills/<id>/SKILL.md`) — 마크다운만으로 정의. 비-테크 사용자도 추가 가능.
2. **마크다운 정의 에이전트** (`vault/.weki/agents/<id>.md` + `agents.toml`) — 시스템 프롬프트 + 도구 화이트리스트만 명시. 코드 0줄.
3. **플러그인** (`.weki-plugin` 번들) — 코드 + UI 패널 + 도구 가능. signed/unsigned 분리.
4. **MCP 서버** (`vault/.weki/mcp.toml`) — 외부 시스템(HRIS/ERP/Slack/Confluence)을 도구로 노출.

> **확장 룰** — 새 에이전트(코어 외 모든 카테고리)는 코드 변경 0줄로 vault 에 들어와야 한다. 우리가 코어를 작게 유지하는 이유다.

---

# 6. 슬래시 명령 명세 / Slash Command Spec

## 6.1 명령 문법 / Grammar

```
/<verb> [target] [-- argname value] [--flag] [following natural-language args]
```

예시:

- `/plan` — 현재 문서 빈칸에 5섹션 개요.
- `/plan 정부 R&D 제안서 5장 -- audience 정부심사위원` — 인자 명시.
- `/simplify` — 선택 영역에 3개 톤 옵션.
- `/simplify --tone executive --maxWords 120`
- `/ask 이 노트와 가장 연결도 높은 페이지 5개는?`
- `/ingest path:./inbox/2026-04-arxiv.pdf`
- `/import path:./onboarding-zip/사규-2026.zip --target wiki/policies --preserve-tree --remap-links`
- `/import path:./manuals/ --target wiki/manuals --kind draft` (대량 폴더 임포트)
- `/find 근속연수 정의 --kind concept --since 2025-01-01`
- `/refactor "사원" -> "구성원" --scope wiki/policies --exclude wiki/legacy --preview`
- `/diff doc:사규-제2장 --rev 12 --rev 17`
- `/blame range:42:118` (현재 문서의 42–118자 범위)
- `/revert run:9b14...` (한 import_run 되돌리기)

## 6.2 명령 매핑 표 / Command Mapping Tables

코어(v1 동봉)·시스템(vault 운영)·확장(marketplace) 으로 분리 (§5 와 정합).

### 6.2.1 코어 / Core (v1 GA 동봉, 즉시 활성)

| Slash | Agent | Selection 필요? | Multi-doc? | Default Apply Mode |
|---|---|---|---|---|
| `/draft` | `draft` | 선택 시 해당 영역, 없으면 빈 문서 | no | dry-run preview |
| `/improve` | `improve` | yes | no | preview-3-options |
| `/ask` | `ask` | n/a | yes (search) | append-as-new-doc |

### 6.2.2 시스템 / System ops (v1 동봉)

| Slash | 작업 | Selection 필요? | Multi-doc? | Default Apply Mode |
|---|---|---|---|---|
| `/import` | `import` | n/a (target=folder/zip/file) | yes (bulk) | confirm-then-apply (preview 트리 + 충돌 표시) |
| `/ingest` | `ingest` | n/a (target=path) | no | confirm-then-apply |
| `/find` | `find` | n/a | yes | report only |
| `/diff` | `diff` | n/a | no | report only |
| `/blame` | `blame` | yes (range) | no | report only |
| `/revert` | `revert` | n/a | depends on target | confirm-then-apply |
| `/lint` | `lint` | n/a | yes | report only |
| `/compile` | `compile` | n/a | yes | scheduled or manual |

### 6.2.3 1st-party 확장 / Extensions (사용자 활성화 후 노출)

| Slash | Agent | Selection 필요? | Multi-doc? | Default Apply Mode |
|---|---|---|---|---|
| `/plan` | `plan` | optional | no | dry-run preview |
| `/expand` | `expand` | yes | no | preview |
| `/simplify` | `simplify` | yes | no | preview-3-options |
| `/crosslink` | `crosslink` | no | no | inline-suggest |
| `/review` | `review` | no | optional | report only |
| `/summarize` | `summarize` | n/a (target=doc(s)) | yes | confirm |
| `/outline` | `outline` | no | no | apply |
| `/translate` | `translate` | yes | no | preview |
| `/cite` | `cite` | yes | no | preview |
| `/slides` | `slides` | no | no | confirm |
| `/diagram` | `diagram` | optional | no | preview |
| `/refactor` | `refactor` | optional (scope) | yes | preview-multi-doc → confirm |

> **사용자 정의 슬래시 명령** — `vault/.weki/agents/<id>.md` + `agents.toml` 등록만으로 즉시 추가됨. §10 참조.

## 6.3 파서 컨트랙트 / Parser contract (TypeScript)

```ts
// packages/core/src/slash/parse.ts
export interface SlashInvocation {
  verb: string;                // "plan"
  target?: SlashTarget;        // selection | docId | path | none
  args: Record<string, string | boolean | number>;
  freeText?: string;           // natural-language tail
  raw: string;                 // the original input
}

export type SlashTarget =
  | { kind: 'selection'; docId: string; from: number; to: number }
  | { kind: 'doc'; docId: string }
  | { kind: 'path'; path: string }
  | { kind: 'query'; query: string };

export function parseSlash(input: string, ctx: EditorContext): SlashInvocation;
```

`parseSlash` 는 순수 함수. 검증 실패 시 `SlashParseError` 를 던진다. 자동완성은 `verb` 와 `argname` 양쪽에 작동.

---

# 7. UI/UX (옵시디언 유사) / Obsidian-like UI

## 7.1 레이아웃 원칙 / Layout principles

- **3-pane** 기본: 좌측 파일트리/태그·검색, 가운데 에디터(탭+분할), 우측 백링크/그래프 미니맵/에이전트 패널.
- **명령 팔레트** (`Cmd/Ctrl+K`) 와 **슬래시 메뉴** (`/` in editor) 는 다르게 동작:
  - 명령 팔레트 = 앱 명령(파일 열기, 설정 등) + 에이전트 메타 명령.
  - 슬래시 메뉴 = 본문에 인라인으로 실행되는 에이전트 명령.
- **그래프뷰**: v1 은 force-directed 2D (sigma.js), 노드=문서, 엣지=`[[wiki link]]`. v2 에서 RDF/Triple 그래프(주어·술어·목적어) 를 옵션으로.
- **Daily note** 와 **inbox** 는 양 축. inbox 는 "raw"의 진입로, daily note 는 사용자 사고의 진입로.

## 7.2 메뉴 구조 / Top-level menus

```
File   : New / Open vault / Open in window / Recent / Export (md, pdf, docx, pptx) / Quit
Edit   : Undo (vault scope), Redo, Find/Replace, Find in vault
View   : Toggle left/right pane, Graph view, Backlinks, Outline, Reading mode
Vault  : Compile (incremental) / Compile (full) / Lint / Health check / Backup
Agents : Run last command / Open AGENTS.md / Manage agents / Approval queue
Plugins: Browse / Installed / Reload
Help   : Keyboard shortcuts / Send feedback / Docs
```

## 7.3 핵심 단축키 / Key bindings (defaults)

| 동작 | macOS | Windows/Linux |
|---|---|---|
| 명령 팔레트 | `⌘K` | `Ctrl+K` |
| 빠른 파일 열기 | `⌘O` | `Ctrl+O` |
| 새 노트 | `⌘N` | `Ctrl+N` |
| 그래프뷰 토글 | `⌘⇧G` | `Ctrl+Shift+G` |
| 백링크 토글 | `⌘⇧B` | `Ctrl+Shift+B` |
| 슬래시 메뉴 | `/` (in editor) | `/` |
| 마지막 에이전트 재실행 | `⌘⇧R` | `Ctrl+Shift+R` |
| 승인 큐 열기 | `⌘⇧A` | `Ctrl+Shift+A` |
| 분석↔편집 모드 토글 | `Tab` (focus 가 모드 칩) | `Tab` |
| Vault 전체 검색 (`/find`) | `⌘⇧F` | `Ctrl+Shift+F` |
| Vault 변경 이력 (`/diff` 패널) | `⌘⇧H` | `Ctrl+Shift+H` |

## 7.4 에디터 / Editor

- 베이스: **CodeMirror 6** (가벼운 마크다운 + LSP). 표/임베드를 위해 ProseMirror 위젯을 일부 영역에서 호출.
- 마크다운 확장: `[[wiki link]]`, `![[embed]]`, `#tag`, frontmatter YAML, Mermaid, footnote, callout.
- **에이전트 패치 미리보기**: diff 인라인(추가=초록 하이라이트, 삭제=취소선), 우측 패널에서 옵션 비교, 단축키 `1/2/3` 으로 옵션 선택, `A` 로 적용, `R` 로 거절.
- **보이스 입력 X (v1)**, **수식 X (v1)** — 명시적 비-목표.

## 7.5 그래프뷰 / Graph view

- v1: force-directed, 필터(태그/타입/시간), 노드 크기 = 백링크 수, 색상 = `documents.kind`.
- v2: JSON Triple 그래프 모드 추가. 술어(`predicate`) 별로 엣지 색상/스타일 분리.
- 성능 목표: 5,000 노드까지 60fps, 50,000 노드까지 30fps (WebGL).

## 7.6 분석 모드 ↔ 편집 모드 토글 / Analyze ↔ Edit mode (opencode plan/build 차용)

opencode 의 `plan/build` 토글을 비-테크 사용자 친화 명칭(**분석 / 편집**) 으로 노출. 우측 상단 모드 칩 + `Tab` 단축키.

- **분석 모드 (Analyze, default for new vault)** — 모든 슬래시 명령은 `read-only` 카테고리만 활성. `/find`, `/diff`, `/blame`, `/review`, `/lint`, `/ask` 만 보인다. 어떤 patch 도 적용되지 않음. `/refactor` 같은 쓰기 명령은 회색 비활성.
- **편집 모드 (Edit)** — 전체 명령 카탈로그 활성. 모든 patch 는 여전히 §11.4 approval queue 통과 후 적용.
- **승인 정책** — `vault/.weki/AGENTS.md` 의 `default_mode: analyze|edit` 로 vault 별 기본값 지정. 신규 사용자 vault 는 `analyze` 가 기본 (실수 보호).
- **가시성** — 모드 칩이 항상 화면에 보임. 편집 모드에서는 부드러운 색 톤(노란 배경) 으로 사용자가 "지금 변경이 가능한 모드" 임을 인식.

# 8. 데이터 모델 / Data Model (PostgreSQL 16+)

## 8.1 설계 원칙 / Principles

1. **파일 ↔ 행 동등** — `vault/wiki/foo.md` 와 `documents` 행은 항상 동기화. 둘 중 하나가 진실 근원이 아니라, 둘 다 갱신하는 트랜잭션을 보장한다(2-phase write, §11.1).
2. **불변 raw** — `raw_sources` 는 update 금지(`tg_raw_sources_no_update` 트리거).
3. **Append-only audit** — `agent_runs`, `audit_log` 는 PK + `revoked_at` 만 변경 가능, 행 자체는 immutable 취급.
4. **Triple graph 차후** — v1 은 단순 `links(src, dst, kind)`, v2 에서 `triples(s, p, o)` 추가.
5. **Multi-tenant 준비** — 모든 도메인 테이블에 `org_id` 컬럼. v1 single-tenant 도 default org 1개로 구동.

## 8.2 핵심 스키마 (DDL 일부) / Schema (selected DDL)

```sql
-- 0. extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;        -- pgvector

-- 1. tenancy & users
CREATE TABLE orgs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       citext NOT NULL UNIQUE,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  org_id      uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('owner','admin','editor','reader')),
  PRIMARY KEY (org_id, user_id)
);

-- 2. vaults & docs
CREATE TABLE vaults (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name            text NOT NULL,
  fs_root         text,             -- desktop only; null on browser
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE TABLE raw_sources (           -- IMMUTABLE
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id        uuid NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  uri             text NOT NULL,    -- file://..., https://..., s3://...
  mime            text NOT NULL,
  sha256          bytea NOT NULL,
  bytes           bigint NOT NULL,
  imported_by     uuid REFERENCES users(id),
  imported_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vault_id, sha256)
);
CREATE OR REPLACE FUNCTION raw_sources_no_update() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'raw_sources is immutable'; END $$ LANGUAGE plpgsql;
CREATE TRIGGER tg_raw_sources_no_update BEFORE UPDATE ON raw_sources
  FOR EACH ROW EXECUTE FUNCTION raw_sources_no_update();

CREATE TABLE documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id        uuid NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  path            text NOT NULL,                          -- e.g., wiki/concepts/llm-wiki.md
  title           text NOT NULL,
  kind            text NOT NULL CHECK (kind IN
                    ('concept','entity','source','overview','index','log','qa','summary','slides','draft')),
  body            text NOT NULL DEFAULT '',
  body_tsv        tsvector GENERATED ALWAYS AS
                    (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(body,''))) STORED,
  frontmatter     jsonb NOT NULL DEFAULT '{}'::jsonb,
  rev             bigint NOT NULL DEFAULT 1,              -- monotonically increasing
  body_sha256     bytea NOT NULL,                          -- = sha256(body)
  embedding       vector(1024),                            -- pgvector; nullable until embedded
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES users(id),
  last_editor     text NOT NULL CHECK (last_editor IN ('human','agent')) DEFAULT 'human',
  UNIQUE (vault_id, path)
);
CREATE INDEX documents_kind_idx        ON documents (vault_id, kind);
CREATE INDEX documents_updated_idx     ON documents (vault_id, updated_at DESC);
CREATE INDEX documents_body_tsv_idx    ON documents USING gin (body_tsv);
CREATE INDEX documents_body_trgm_idx   ON documents USING gin (body gin_trgm_ops);
CREATE INDEX documents_frontmatter_idx ON documents USING gin (frontmatter jsonb_path_ops);
CREATE INDEX documents_embedding_idx   ON documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 2b. import_runs (bulk import of existing docs: 사규/매뉴얼/Notion·Confluence export 등)
--     단위: 한 번의 /import 작업. 같은 run 내 문서들은 묶어서 rollback 가능.
CREATE TABLE import_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id        uuid NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  invoked_by      uuid REFERENCES users(id),
  source_kind     text NOT NULL CHECK (source_kind IN
                    ('folder','zip','docx','md','notion_export','confluence_export','google_docs','html','mixed')),
  source_summary  jsonb NOT NULL,    -- {root_path, file_count, byte_total, detected_formats[]}
  options         jsonb NOT NULL,    -- {preserve_tree, remap_links, target_dir, default_kind, conflict_strategy}
  status          text NOT NULL CHECK (status IN ('queued','running','succeeded','partial','failed','rolled_back')),
  doc_count       int NOT NULL DEFAULT 0,
  attachment_count int NOT NULL DEFAULT 0,
  conflict_count  int NOT NULL DEFAULT 0,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  rollback_of     uuid REFERENCES import_runs(id),
  notes           text
);
CREATE INDEX import_runs_vault_time ON import_runs (vault_id, started_at DESC);

-- 2c. documents.frontmatter "import" 메타데이터 컨벤션 (스키마 변경 없이 jsonb 로):
--     {
--       "_import": {
--         "run_id": "<import_runs.id>",
--         "source_kind": "docx",
--         "original_path": "사규/제2장-근태.docx",
--         "original_format": "docx",
--         "preserved": ["headings","numbering","tables"],
--         "imported_at": "2026-04-26T03:21Z"
--       }
--     }
-- → `documents_frontmatter_idx` GIN 으로 `frontmatter @? '$._import.run_id'` 쿼리 가능.
-- → 한 import_run rollback 시 이 키로 affected docs 를 골라낸다.

-- 3. links (graph v1)
CREATE TABLE links (
  src_doc_id  uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  dst_doc_id  uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  kind        text NOT NULL DEFAULT 'wikilink' CHECK (kind IN ('wikilink','embed','citation','derived_from')),
  occurrences int NOT NULL DEFAULT 1,
  PRIMARY KEY (src_doc_id, dst_doc_id, kind)
);

-- 4. tags
CREATE TABLE tags (
  vault_id uuid NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  name     text NOT NULL,
  PRIMARY KEY (vault_id, name)
);
CREATE TABLE document_tags (
  doc_id  uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  vault_id uuid NOT NULL,
  name    text NOT NULL,
  PRIMARY KEY (doc_id, name),
  FOREIGN KEY (vault_id, name) REFERENCES tags(vault_id, name) ON DELETE CASCADE
);

-- 5. doc_versions (full-fidelity history)
CREATE TABLE doc_versions (
  doc_id      uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  rev         bigint NOT NULL,
  body        text NOT NULL,
  body_sha256 bytea NOT NULL,
  frontmatter jsonb NOT NULL,
  source      text NOT NULL CHECK (source IN ('human','agent','sync')),
  agent_run_id uuid,                                  -- nullable
  committed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (doc_id, rev)
);

-- 6. agents & runs
CREATE TABLE agents (
  id          text PRIMARY KEY,                       -- 'plan','simplify',...
  vault_id    uuid REFERENCES vaults(id),             -- nullable for global builtins
  version     text NOT NULL,
  capabilities jsonb NOT NULL,                        -- tools, scopes, limits
  prompt_path text,                                   -- vault/.weki/agents/<id>.md
  enabled     bool NOT NULL DEFAULT true,
  UNIQUE (id, vault_id)
);

CREATE TABLE agent_runs (                             -- append-only
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id     uuid NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  agent_id     text NOT NULL,
  invoked_by   uuid REFERENCES users(id),
  invocation   jsonb NOT NULL,                        -- SlashInvocation snapshot
  status       text NOT NULL CHECK (status IN ('queued','running','succeeded','failed','rejected')),
  patch        jsonb,                                 -- final patch (if any)
  cost_tokens  int,
  cost_usd_microcents bigint,
  model        text,
  started_at   timestamptz,
  finished_at  timestamptz,
  error        text,
  parent_run_id uuid REFERENCES agent_runs(id)        -- for sub-agents under /compile
);
CREATE INDEX agent_runs_vault_time ON agent_runs (vault_id, started_at DESC);

-- 7. patches (proposed but not yet applied)
CREATE TABLE patches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  ops          jsonb NOT NULL,                        -- PatchOp[]
  preview_html text,                                  -- pre-rendered diff
  status       text NOT NULL CHECK (status IN ('proposed','applied','rejected','superseded')) DEFAULT 'proposed',
  decided_by   uuid REFERENCES users(id),
  decided_at   timestamptz
);

-- 8. audit log
CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  vault_id    uuid REFERENCES vaults(id),
  actor_kind  text NOT NULL CHECK (actor_kind IN ('user','agent','system')),
  actor_id    text NOT NULL,
  action      text NOT NULL,
  target_kind text,
  target_id   text,
  payload     jsonb,
  at          timestamptz NOT NULL DEFAULT now()
);

-- 9. triple graph (v2 옵션) / triples reservation
CREATE TABLE triples (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id  uuid NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  s_doc_id  uuid REFERENCES documents(id) ON DELETE CASCADE,
  p         text NOT NULL,                            -- predicate URI/slug
  o_doc_id  uuid REFERENCES documents(id) ON DELETE CASCADE,
  o_literal jsonb,                                    -- if object is literal
  weight    real NOT NULL DEFAULT 1.0,
  source    text NOT NULL CHECK (source IN ('agent','human','derived')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX triples_spo ON triples (vault_id, s_doc_id, p);
CREATE INDEX triples_pos ON triples (vault_id, p, o_doc_id);
```

## 8.3 RLS / Row-Level Security (요지)

- `org_id` 가 있는 테이블에 모두 RLS 활성화.
- 정책: `current_user_org_ids()` 가 반환하는 집합에 속할 때만 SELECT/UPDATE.
- 데스크톱 single-user 모드에서도 RLS 켜둔다 (코드 분기 줄이려고).

## 8.4 Patch JSON 스키마 / Patch JSON shape

```ts
// packages/core/src/patch.ts
export type PatchOp =
  | { kind: 'replace_range'; doc_id: string; from: number; to: number; text: string }
  | { kind: 'insert_section_tree'; doc_id: string; at: number; tree: SectionNode[] }
  | { kind: 'insert_checklist'; doc_id: string; at: number; items: string[] }
  | { kind: 'insert_link'; doc_id: string; at: number; target_doc_id: string; alias?: string }
  | { kind: 'insert_footnote'; doc_id: string; at: number; mark: string; body: string }
  | { kind: 'create_doc'; path: string; kind: DocumentKind; title: string; body: string; frontmatter?: Record<string, unknown> }
  | { kind: 'update_index'; entries: IndexEntryPatch[] }
  | { kind: 'append_log'; line: string }
  | { kind: 'replace_section'; doc_id: string; section: string; body: string };

export interface Patch {
  id: string;
  agent_run_id: string;
  ops: PatchOp[];
  rationale?: string;
  preview_html?: string;
}
```

모든 op 는 멱등 가능해야 한다(재적용 시 같은 결과). `replace_range` 는 `body_sha256` 으로 sanity check.

---

# 9. 코드 구조 / Code Layout (TypeScript monorepo)

## 9.1 모노레포 / Monorepo

```
weki/
├─ package.json (pnpm workspaces, turborepo)
├─ packages/
│  ├─ core/                # shared types, patch logic, parsers (pure TS)
│  ├─ db/                  # drizzle-orm schema, migrations
│  ├─ desktop/             # Tauri 2 shell (Rust + TS bridge)
│  ├─ web/                 # Next.js 15 web app
│  ├─ editor/              # CodeMirror 6 + ProseMirror bridge package
│  ├─ graph/               # graph view (sigma.js wrapper)
│  ├─ agent-server/        # opencode-derived HTTP+SSE server (TS)
│  ├─ agent-runtime-py/    # pydantic-ai workers (Python; published as wheel)
│  ├─ plugin-sdk/          # public API for community plugins
│  └─ cli/                 # `weki` command
├─ apps/
│  ├─ docs/                # Astro Starlight docs
│  └─ marketing/           # Next.js
├─ specs/                  # this PRD + spec docs
└─ vendor/                 # (옵션) 차용한 외부 패키지 + 패치. critical path 아님 (§4.3.2)
```

## 9.2 의존성 정책 / Dependency policy

- `packages/core` 는 런타임 의존성 0 (zod 만 허용).
- `packages/db` 는 `pg`, `drizzle-orm`, `pgvector` only.
- `packages/desktop` 의 Rust 측은 `tauri`, `tokio`, `serde`, `notify` (FS watcher) 만.
- `packages/agent-runtime-py` 는 `pydantic-ai`, `pydantic`, `httpx`, `sqlalchemy[asyncio]`, `asyncpg`.
- 풀 옵션 모델 SDK 는 `pydantic-ai` 가 이미 추상화하므로 따로 의존 안 함.

## 9.3 빌드·테스트 / Build & test

- `turbo run build`, `turbo run test` 로 캐시.
- desktop 빌드: GitHub Actions → 서명된 macOS dmg, Windows exe (signpath), Linux deb/rpm/AppImage.
- web 빌드: Vercel.
- 테스트 매트릭스: unit (vitest, pytest) → component (Playwright Component) → e2e (Playwright + Tauri driver).

---

# 10. IPC, 확장 경로 / IPC and Extension Paths

## 10.1 IPC 규약 / IPC contract

데스크톱 4-tier:

1. **Renderer ↔ Core (Rust)** — Tauri commands/events. JSON 직렬화. 모든 commands 는 `core::ipc::*` 에 한 곳에 등록.
2. **Core ↔ Agent daemon** — Unix domain socket on macOS/Linux, named pipe on Windows. JSON-RPC 2.0.
3. **Agent daemon ↔ Agent worker (Python)** — stdin/stdout JSON-RPC. 워커는 무상태 child. 세션은 daemon 에 저장.
4. **Daemon ↔ Postgres / Object store** — 표준 드라이버.

브라우저는 1·2·3 을 단일 HTTPS+SSE 엔드포인트로 fold.

## 10.2 확장 경로 4단계 / Four extension tiers (가벼움 → 무거움)

> **핵심 — 코어를 작게 유지한 진짜 이유는 여기에 있다.** 사용자/조직이 자기 도메인(법률·의료·공공·교육·보안 등)에 맞춰 에이전트를 *덧붙이는* 경로를 가벼운 것부터 4단계로 제공한다. 단계가 높을수록 능력이 크지만 책임/검증 부담도 크다. 같은 메커니즘으로 1st-party 확장(§5.3)도 작성된다 — 즉 **마켓플레이스의 모든 에이전트가 사용자 정의 에이전트의 본보기**.

| 단계 | 형식 | 위치 | 난이도 | 능력 한도 | 누가 만드는가 |
|---|---|---|---|---|---|
| **T1 · Skill** | `SKILL.md` + 옵션 스크립트 | `vault/.weki/skills/<id>/` | 마크다운 한 장 | 코어 에이전트의 호출 패턴(예: `draft` 시 자동 첨부 컨텍스트) | 비-테크 사용자, 운영팀 |
| **T2 · 마크다운 정의 에이전트** | `<id>.md` (시스템 프롬프트) + `agents.toml` 한 줄 | `vault/.weki/agents/` | 코드 0줄 | 신규 슬래시 명령 + 코어 도구 화이트리스트 안의 도구만 | 도메인 전문가, 조직 운영자 |
| **T3 · 플러그인** | `.weki-plugin` 번들 (manifest + JS bundle + 선택적 Python worker) | 사용자 설치 | TypeScript/Python | 신규 도구·UI 패널·매크로 | 개발자, 3rd-party 벤더 |
| **T4 · MCP 서버** | `mcp.toml` 등록, 외부 프로세스/HTTP | `vault/.weki/mcp.toml` | 임의 언어 | 사내 시스템(HRIS/ERP/CRM/Slack/Confluence 등)을 도구로 노출 | IT/플랫폼팀 |

### 10.2.1 T1 · Skill

```
vault/.weki/skills/legal-tone/
├── SKILL.md          # 사용 시점·트리거·예시·금칙어
├── examples/         # few-shot 예시 (옵션)
└── glossary.md       # 도메인 용어집 (옵션)
```

`SKILL.md` 의 frontmatter 가 트리거를 정의하고, 본문은 사람이 읽는 지침. 코어 에이전트가 `improve`/`draft` 호출 시 자동으로 컨텍스트에 합류. 가장 가벼운 진입점이며, **비-테크 사용자가 하루 안에 회사 톤을 학습시키는 통로**.

### 10.2.2 T2 · 마크다운 정의 에이전트 / Markdown-defined agent

```
vault/.weki/agents/contract-checklist.md   # 시스템 프롬프트 + 출력 스펙
vault/.weki/agents.toml                     # 등록부
```

```toml
# agents.toml 한 줄
[[agent]]
id = "contract-checklist"
slash = "/contract"
prompt = "agents/contract-checklist.md"
tools = ["read_doc", "search_vault", "lint_terms"]   # 화이트리스트
output = "Patch"                                       # or "ReadOnlyAnswer"
mode = "edit"                                          # 또는 "analyze"
```

**코드 0줄로 새 슬래시 명령이 마련된다.** 1st-party 확장 에이전트(§5.3)도 사실 이 형식의 더 정교한 버전이다 — 즉 사용자가 그 1st-party 에이전트를 자기 vault 에서 *복제·수정* 해 자기 변형을 만들 수 있다.

### 10.2.3 T3 · 플러그인 / Plugin

- 분포 단위: `.weki-plugin` (zip; manifest + JS bundle + 선택적 Python 워커 스펙).
- 매니페스트:

```toml
# plugin.toml
id = "com.example.tone-coach"
name = "Tone Coach"
version = "0.3.1"
api = ">=0.1 <0.2"
permissions = ["read_doc", "search_vault"]
agents = ["tone-coach"]
slash_commands = ["/tone"]
ui_panels = ["right.tone"]
mcp_servers = []
skills = ["skills/tone"]
```

- 호스트 모델: 샌드박스(QuickJS for plugin JS, separate venv for Python worker).
- 신뢰도: signed plugins 가 1급. 미서명 플러그인은 "Developer mode" 설정에서만 로드.
- 1st-party marketplace 에 들어가는 §5.3 의 확장 에이전트가 모두 이 형식을 따른다.

### 10.2.4 T4 · MCP 서버 / MCP server

- Agent daemon 은 MCP host. 사용자가 `vault/.weki/mcp.toml` 로 등록.
- 에이전트는 자기 capability 화이트리스트 안에서만 MCP 도구 호출 (§11.4 approval).
- 흐름: agent → daemon → MCP server → tool result → daemon → agent.
- 표준 차용 — opencode 코드 의존 없음.

```toml
# vault/.weki/mcp.toml
[[server]]
id = "internal-hris"
transport = "stdio"
command = "/usr/local/bin/hris-mcp"
permissions = ["read_employee_directory"]
requires_approval = ["search_employee_pii"]
```

## 10.3 등록 우선순위 / Resolution order

같은 슬래시 이름이 두 단계에서 정의되면 **사용자 vault 가 항상 이긴다**: T1/T2 (vault) > T3 (플러그인) > 1st-party 기본. 충돌 시 명령 팔레트에서 출처 표시.

## 10.4 확장 SDK 의 약속 / Extension SDK promises

- **Stable surface** — Patch op 종류와 도구 화이트리스트는 SemVer. minor 변경은 호환, major 만 깨짐.
- **Doc-first** — 새 op 는 PRD 부록에 추가된 뒤에만 SDK 노출.
- **Same eval framework** — 1st-party·3rd-party 같은 골든셋 형식(§12).

---

# 11. 보안·권한·동기화 / Security, RBAC, Sync

## 11.1 파일↔DB 일관성 / FS-DB consistency

- **Write path**: human edit → renderer → core. Core 는 1) `documents.body` 업데이트(트랜잭션 시작) 2) `vault/wiki/...md` 임시 파일에 fsync 3) commit → atomic rename. 실패 시 둘 다 롤백.
- **Watcher path**: 외부 에디터(예: Obsidian) 가 파일을 직접 수정하면 watcher 가 5초 debounce 후 `documents` 에 reconcile (last-writer-wins, 단 `last_editor='agent'` 이고 충돌이면 agent 변경을 보존하고 사용자에게 머지 다이얼로그).

## 11.2 모드 / Modes

- **Solo (P-IND)** — 권한 체크 최소, 모든 에이전트 자동 실행 가능. 단 patch preview 는 항상 보여줌.
- **Team (P-STARTUP)** — 역할 기반(`owner|admin|editor|reader`). reader 는 read-only, editor 는 patch 제안 가능, admin 은 적용 권한.
- **Enterprise (P-ENT)** — Team + audit export + SSO + IP allowlist + DLP 훅.

## 11.3 RBAC 매트릭스 / RBAC

| 액션 | reader | editor | admin | owner |
|---|---|---|---|---|
| 문서 읽기 | ✓ | ✓ | ✓ | ✓ |
| 문서 직접 편집 | – | ✓ | ✓ | ✓ |
| 슬래시 명령 실행 (read agents) | ✓ | ✓ | ✓ | ✓ |
| 슬래시 명령 실행 (write agents) | – | ✓ | ✓ | ✓ |
| Patch 적용 | – | ✓ (자기 제안) | ✓ | ✓ |
| 에이전트 추가/삭제 | – | – | ✓ | ✓ |
| RBAC 변경 | – | – | – | ✓ |
| Audit export | – | – | ✓ | ✓ |

## 11.4 Human-in-the-loop / Approval queue

- 위험 도구(`web_fetch`, `ocr` 외부 호출, 외부 MCP 도구) 는 `requires_approval=true`.
- 승인은 인 채팅이 아니라 **앱 내 Approval Queue** (`Cmd+Shift+A`) 에서 명시 클릭. CLI/외부 트리거로 우회 불가.
- 자동 승인 토큰/타이머/"agreed in document" 같은 비-UI 승인은 **금지**.

## 11.5 비밀·키 / Secrets

- API 키는 OS keychain (macOS Keychain, Windows Credential Manager, libsecret) 에만 저장.
- Postgres 는 비밀번호 대신 OAuth (Supabase/Neon) 또는 socket peer auth 우선.
- 비밀이 frontmatter/노트에 들어오면 client-side 감지(정규식 + entropy) 후 마스킹 + 사용자에게 알림.

---

# 12. 옵저버빌리티·에이블·비용 / Observability, Evals, Cost

- **Tracing**: OpenTelemetry. pydantic-ai → OTLP → Logfire 또는 사용자 OTEL 백엔드.
- **Evals**: `pydantic_evals` 로 골든셋. 각 에이전트는 최소 30개 케이스의 회귀 스위트 보유. CI 게이트.
- **Cost**: `agent_runs.cost_*` 로 토큰/USD 추적. 사용자 대시보드 + 월별 budget 알림.
- **Sampling**: prompt/response 의 디스크 영구 저장은 사용자 명시 opt-in.

---

# 13. 구현 가이드 (AI 코딩 에이전트 + 엔지니어용) / Implementation Guide for AI Coding Agents and Engineers

> **이 절의 독자는 PRD 를 코드로 옮기는 쪽**(AI 코딩 에이전트 또는 엔지니어)이다. 제품의 사용자(기업·학교·스타트업·개인)와 혼동하지 않는다 — 그들은 §1·§2·§7 의 UX 의사결정에서 1순위로 보호된다.
>
> 이 절은 **Claude Code · Codex · Cursor · VS Code Copilot** 가 직접 읽고 슬라이스 단위로 작업을 시작할 수 있도록 구조화되어 있다.

## 13.1 읽기 순서 / Reading order

1. §1, §3 — 비전·컨셉 모델.
2. §4 — 아키텍처 큰 그림.
3. 작업할 슬라이스가 의존하는 절(§5–§11) 만 선택적으로.
4. §13.3 슬라이스 카탈로그에서 1개만 골라 시작.

## 13.2 일반 규칙 / General rules

- **Vertical slice 우선**: 모든 PR 은 "사용자가 보는 기능 1개" 단위. 횡단 리팩터링은 별도 PR.
- **Patch 가 진실**: 에이전트 출력은 항상 `Patch`. 본문에 직접 쓰는 코드는 거절한다.
- **Schema-first**: 새 데이터 흐름은 (1) `packages/core` 의 zod 스키마 → (2) drizzle migration → (3) UI 순서.
- **테스트 동반**: 새 op 추가 시 vitest, 새 에이전트 추가 시 pytest + 5개 이상 evals 케이스 동반.
- **i18n 준비**: 모든 사용자 노출 문자열은 `packages/core/src/i18n` 의 키로. v1 은 ko/en.

## 13.3 슬라이스 카탈로그 (v1 GA 까지) / Slice catalog

> **편성 원칙** — 코어는 작게, 확장 인프라는 일찍. v1 GA 까지 새 에이전트를 *코드로* 추가하는 슬라이스는 코어 3개(`draft`/`improve`/`ask`)뿐이다. 1st-party 확장 에이전트들은 §5.3 의 marketplace 형식(T2/T3)으로 작성되며, 슬라이스가 아니라 출시 컨텐츠로 분류된다.

| ID | 제목 | 의존 절 | DOD (Definition of Done) |
|---|---|---|---|
| **S-01** | 모노레포 부트스트랩 | §9 | `pnpm i && turbo run build` 통과, GH Actions 그린 |
| **S-02** | Postgres 스키마 v1 + drizzle 마이그레이션 | §8 | `pnpm db:reset && pnpm db:migrate` 그린, RLS 통합 테스트 통과 |
| **S-03** | 로컬 Vault FS watcher + 2-phase write | §11.1 | 손편집·에이전트편집 동시성 테스트 100/100 통과 |
| **S-04** | CodeMirror 6 에디터 + 슬래시 메뉴 | §6, §7.4 | `/draft` 더미 명령이 정확히 파싱·렌더, 출처별 충돌 표시 |
| **S-05** | Agent daemon (자체 구현, opencode 패턴 참고) | §4.3, §10 | HTTP+SSE 헬스체크, 더미 에이전트 `echo` 실행. *opencode 코드 의존 없음.* |
| **S-06** | DraftAgent (코어 1) | §5.1, §4.4 | `/draft` 으로 빈 문서→개요+초안 또는 선택→확장, evals ≥ 0.8 |
| **S-07** | Patch preview + Approval queue | §8.4, §11.4 | 옵션 비교 UI, 키보드 적용/거절, audit_log 기록 |
| **S-08** | ImproveAgent (코어 2) + AskAgent (코어 3) | §5.1 | `/improve` 3옵션 readability 차이 측정, `/ask` 검색→qa 페이지 자동 저장 |
| **S-09** | 시스템 작업: ingest + import | §5.2, §2.2, §8.2 `import_runs` | PDF/URL/이미지 ingest, docx/Notion/Confluence import (트리/링크 보존 ≥ 0.9) |
| **S-10** | 시스템 작업: find + diff/blame/revert + lint | §5.2, §4.3.3 | 1만 노드 검색 p50 ≤ 500ms, doc_versions 비교, 한 줄 blame 100%, 깨진 링크 검출 |
| **S-11** | Markdown LSP 진단 + 분석↔편집 모드 토글 | §7.6, §10 | 1만 노드에서 빨간 밑줄 ≤ 200ms, 신규 vault 는 analyze 기본 |
| **S-12** | RBAC + 멀티유저 | §11.2-3 | 권한 위반 통합테스트 100% |
| **S-13** | Web app v1 (read-mostly) | §4.2 | 데스크톱과 동일 vault 를 브라우저에서 read+질의 |
| **S-14a** | **확장 인프라 T1+T2** (Skill / 마크다운 정의 에이전트) | §10.2.1, §10.2.2 | `vault/.weki/skills/` 와 `agents/` 의 SKILL.md / `<id>.md` 만으로 신규 슬래시 명령 동작, 코드 0줄 검증 |
| **S-14b** | **확장 인프라 T3** (플러그인 SDK + 샘플 플러그인) | §10.2.3 | `tone-coach` 샘플이 마켓 매니페스트로 로드, 권한 화이트리스트 강제 |
| **S-14c** | **확장 인프라 T4** (MCP 호스트) | §10.2.4 | `vault/.weki/mcp.toml` 등록, approval queue 통과 강제 |
| **S-15** | Triples 그래프 차후 토글 | §8.2, §7.5 | 옵션 켜면 v1 links 그대로 + triple view 추가 |
| **S-16** | Eval 회귀 + 비용 대시보드 | §12 | 코어 3개 + 시스템 작업 30 케이스, CI 차단 가능 |
| **S-17** (출시 컨텐츠) | 1st-party 확장 에이전트 묶음 (§5.3) — `plan`/`expand`/`simplify`/`crosslink`/`review`/... | §5.3, §10.2 | 각 에이전트가 T2 또는 T3 형식으로 marketplace 등록, 사용자 1-클릭 활성화 가능 |

## 13.4 PR 템플릿 / PR template (요지)

```
## Slice
S-XX

## What changed
- ...

## Schema migrations
- [ ] none / [ ] in `packages/db/migrations/2026XXXX-xxx.sql`

## Patch ops added
- [ ] none / [ ] new `PatchOp` kinds: ...

## Evals
- agents touched: [...]
- before/after on golden set: ...

## RBAC impact
- [ ] none / [ ] requires policy update

## Screenshots / GIFs
```

## 13.5 코드 리뷰 체크리스트 / Code review checklist

1. 모든 사용자 노출 문자열 i18n 키.
2. 새 SQL 은 EXPLAIN 첨부, 1k/100k/1M 행에서 시간 보고.
3. 새 op 는 멱등성 단위테스트 보유.
4. 외부 호출(`web_fetch`, MCP) 추가 시 §11.4 approval 게이트.
5. Postgres 인덱스 추가 시 정당화 1줄 + 평균 쿼리 빈도.

---

# 14. 마일스톤·로드맵 / Milestones & Roadmap

> 모든 마일스톤은 **사용자 가치 + 측정 가능한 게이트** 를 가진다.

| 마일스톤 | 목표 가치 | 슬라이스 | 게이트 / Gates |
|---|---|---|---|
| **M0 · Foundation** (W1–W3) | 모노레포·DB·셸 부트 | S-01, S-02, S-03 | CI 그린, Postgres RLS 통합테스트 100%, 데스크톱 셸이 빈 vault 열기 |
| **M1 · Editor & Core Draft** (W4–W6) | "/draft 로 글쓰기 시작" | S-04, S-05, S-06, S-07 | 신규 사용자 5분 안에 `/draft` 성공 비율 ≥ 80% (사용성 5인 테스트) |
| **M2 · Improve · Ask · Data In** (W7–W10) | "다듬기·질문 + 자료 들이기" | S-08 (improve+ask), S-09 (ingest+import) | inbox→wiki 컴파일 정확도(human eval) ≥ 0.8, 사규 zip 임포트 트리/링크 보존 ≥ 0.9 |
| **M3 · Vault Ops & Team** (W11–W14) | "검색·이력·LSP + 팀 모드" | S-10, S-11, S-12, S-13 | 1만 노드 검색 p50 ≤ 500ms, RBAC 위반 0(퍼즈 1만회), 데스크톱·브라우저 동일 vault read |
| **M4 · Extensibility** (W15–W18) | "사용자가 자기 에이전트를 추가" — 4단계 경로 | S-14a, S-14b, S-14c, S-15 | 비-테크 사용자 1명 10분 내 SKILL.md 추가 동작; 외부 개발자 1명 30분 내 hello-world 플러그인 로드; MCP 호스트 approval 게이트 통과 100% |
| **M5 · GA** (W19–W22) | 회귀·비용·서명 + 1st-party 확장 묶음 출시 | S-16, S-17, 문서, 서명 | 코어+시스템 evals 99% 통과, 비용 대시보드, 서명된 빌드 4 OS, marketplace 에 1st-party 확장 에이전트 ≥ 8개 |

---

# 15. 수용 기준 / Acceptance Criteria (v1 GA)

## 15.1 정확성 / Correctness

- A1 · 패치 멱등성: 동일 patch 두 번 적용해도 `body_sha256` 변동 없음.
- A2 · raw 불변성: `raw_sources` UPDATE 시도 시 100/100 거부.
- A3 · 슬래시 파서: 카탈로그의 모든 명령에 대해 fuzz 1만회 무크래시.
- A4 · FS-DB 일관성: 손편집 1k건 + 에이전트 1k건 인터리브 후 sha256 mismatch 0건.
- A5 · Import 충실도(docx/md): 표·번호매김·헤딩 트리 보존율 ≥ 0.9 (골든셋 50개 문서).
- A6 · Import 내부 링크 재매핑: 원본의 상호 참조 중 ≥ 95% 가 wiki `[[link]]` 로 정확 변환, 나머지는 깨진 링크 리포트.
- A7 · Import 트랜잭션성: 한 `/import` 실행은 한 `import_runs` 행으로 묶여 단일 명령으로 rollback 가능. 부분실패 시 `status='partial'` + 충돌 리포트.
- A8 · Import 후 편집 가능성: 임포트된 모든 wiki 노드는 직후 `/Simplify`/`/Review`/`/Crosslink` 의 정상 대상 (스모크 100%).
- A9 · Refactor 안전성: `/refactor` 의 preview 와 실제 적용 결과 간 diff 0 (동일성 보장), 한 명령으로 inverse 가능.
- A10 · Diff/Blame 정확성: 임의 두 리비전 비교 시 한 줄 단위 추적 100%, blame 의 actor/run 매핑 누락 0건.
- A11 · LSP 진단 응답성: 깨진 링크·고아 노드 검출이 1만 노드 vault 에서 변경 발생 후 200ms 내 빨간 밑줄.

## 15.2 성능 / Performance

- P1 · 노트 1만개 vault 부팅 ≤ 3s (M2 Mac, NVMe).
- P2 · `/plan` p50 응답 ≤ 4s (claude sonnet 기준), p95 ≤ 9s.
- P3 · 그래프뷰 5,000 노드 60fps, 50,000 노드 30fps (WebGL).
- P4 · `/compile --since=24h` 1k dirty 페이지에서 ≤ 60s.

## 15.3 안전·권한 / Safety

- S1 · `web_fetch`, `ocr`, MCP 외부 도구는 approval queue 통과 없이 실행 0회.
- S2 · 비밀 패턴(API 키 등) 본문 진입 시 100% 마스킹 알림 (regression 테스트셋).
- S3 · audit_log 누락 0% (1,000 액션 샘플).

## 15.4 협업 / Collaboration

- C1 · reader 가 write 액션 시도 시 100% 거부 + audit.
- C2 · 같은 문서 연속 편집 시 last-writer-wins 머지 정확도 ≥ 99%.

## 15.5 사용성 / Usability

- U1 · 신규 사용자 첫 wiki 페이지 작성까지 5분 이내 (P-IND 5인 사용성 테스트).
- U2 · 슬래시 메뉴는 모든 명령에 1줄 도움말 + 예시 제공.
- U3 · 키보드만으로 "ingest → preview → apply → graph view" 완료 가능.

---

# 16. 위험 & 가설 / Risks & Assumptions

| # | 종류 | 내용 | 완화 |
|---|---|---|---|
| R1 | 기술 | opencode 패턴 차용이 시간이 지나며 변하거나, 옵션 차용한 코드(§4.3.2)가 업스트림 변경과 어긋남 | 기본은 *자체 구현*; 옵션 차용분은 `vendor/` 격리 + 의존 모듈 최소화 + 매주 동기화 잡(옵션 시) |
| R2 | 기술 | pgvector 1024-d 인덱스 성능 한계 | ivfflat → HNSW (pgvector 0.8+) 마이그레이션 경로 준비 |
| R3 | 사용자 | 사용자는 Obsidian 을 안 떠난다 | "Obsidian compatibility mode" — 같은 vault 폴더를 둘 다 사용 가능, 우리는 wiki/ 만 소유 |
| R4 | 모델 비용 | LLM 비용이 ARPU 초과 | provider abstraction(pydantic-ai) → 사용자가 자기 키 BYO, local 모델 옵션 |
| R5 | 보안 | 플러그인을 통한 데이터 유출 | signed 플러그인 기본, 미서명은 dev 모드, capability allowlist |
| R6 | 법무 | 이 PRD를 학습한 에이전트가 외부 코드를 인용 | 코딩 에이전트 가드레일을 plugin-sdk 에 명시(라이선스 헤더 자동 삽입) |

가설(검증 대상):

- H1 · 코어 `/draft` + `/improve` 콤보가 "글쓰기 시작 비용" 을 의미 있게 낮춘다 (M1 사용성 테스트).
- H2 · `IngestAgent` 의 1소스→다페이지 산출이 사용자 만족도의 1차 견인이다 (M2 NPS).
- H3 · 데스크톱 우선 전략이 옳다 (M3 까지 데스크톱:웹 사용시간 ≥ 7:3).

---

# 17. 부록 / Appendix

## 17.1 용어 / Glossary

- **Vault**: 한 사용자/팀의 wiki 루트. 1개 vault = 1개 Postgres `vaults` 행 + 1개 폴더.
- **Raw**: 불변 원본 (PDF, URL 스냅샷, 이미지). 에이전트 read-only.
- **Wiki**: LLM 또는 사람이 만든 마크다운 노드. 백링크/태그/임베딩 보유.
- **Patch**: 에이전트가 제안하는 변경 묶음. 적용 전엔 미반영.
- **Slice**: 사용자에게 가치를 주는 PR 단위.

## 17.2 외부 의존 버전 핀 / Pinned external deps

- Tauri 2.x · React 19 · Next.js 15 · CodeMirror 6 · ProseMirror 1.x
- PostgreSQL 16 · pgvector 0.8 · pg_trgm
- pydantic-ai ≥ 1.70 · pydantic 2.x
- opencode ≥ 1.3.0 (vendored)

## 17.3 결정 로그(요약) / Decision log

- D1 · "Postgres 가 진실 근원" — 파일은 미러. 이유: 멀티유저·인덱스·RLS·감사. (vs Obsidian 의 file-first)
- D2 · "Tauri (Rust) > Electron" — 메모리, 보안, 코어 LSP/FS 모듈 재사용성.
- D3 · "Python 워커 분리" — pydantic-ai 의 본가. TS 포팅 대신 IPC.
- D4 · "Patch is the only currency" — 에이전트가 직접 쓰면 audit/approve 가 무너진다.
- D5 · "v1 graph = simple links, triples 는 차후" — 가치 검증 전 RDF 도입은 과잉.
- D6 · "opencode 는 레퍼런스, 코드 의존은 옵션" — 라이선스/업스트림 추적/패치 부담 회피, 패턴만 흡수해 자체 구현 (§4.3).
- D7 · "코어 에이전트는 3개" — 일반 문서 작성에 직관적인 `draft`/`improve`/`ask` 만 동봉. 다른 모든 동사는 §10.2 의 4단계 확장 경로로 (§5).
- D8 · "확장 인프라 우선" — 1st-party 확장 에이전트도 같은 형식(T2/T3)으로 작성해, 사용자 정의 에이전트가 처음부터 1급 시민이 되도록 (§10.2).

## 17.4 라이선스·인용 / Licensing & attribution

- 본 PRD 영감: Andrej Karpathy의 LLM Wiki gist 442a6bf...; anomalyco/opencode (MIT); pydantic/pydantic-ai (MIT); Obsidian (proprietary, 영감만).
- VelugaLore 자체는 Apache-2.0 (앱), MIT (플러그인 SDK·예제).

## 17.5 공개 인용 / Public quote (≤15 words)

- "Obsidian is the IDE; the LLM is the programmer; the wiki is the codebase."

---

*— end of PRD v0.1.0-draft —*
