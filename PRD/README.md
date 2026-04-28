---
title: "VelugaLore PRD — 섹션 인덱스"
last_updated: 2026-04-28
---

# VelugaLore PRD — 섹션 인덱스

## 두 청중을 위한 문서

이 PRD는 두 청중을 분리해 설계했습니다.

**제품 사용자**(기업의 정책/제안서 담당자, 학교의 강사, 스타트업의 PM, 개인 연구자)는 §1·§2·§7에서 제품의 비전과 사용 경험을 먼저 읽으세요. 모든 UX 결정은 비-테크 사용자를 1순위로 보호합니다.

**구현팀**(AI 코딩 에이전트, 엔지니어)은 §13 "구현 가이드"부터 시작해 작업할 슬라이스를 선택한 후, 그 슬라이스가 참조하는 절만 펼쳐 읽으면 됩니다.

## 한 화면 요약 / At-a-glance

- **코어 5개 동사** — `ingest` · `curate` · `ask` · `draft` · `improve` (§5.1)
- **Karpathy compounding 3축** — `ingest`(자라남) → `curate`(모양 잡기) → `ask`(꺼내 쓰기 + 누적). `draft`/`improve` 는 사용자가 직접 쓸 때의 워드프로세서 동선.
- **확장 4단계** — Skill / 마크다운 정의 에이전트 / 플러그인 / MCP (§10.2). 코어 외 모든 동사는 코드 0줄로 추가 가능.
- **단일 통화** — 에이전트 출력은 항상 `Patch` (§8.4). 본문에 직접 쓰지 않음, 적용은 approval queue 통과 후만.
- **두 진실 근원의 분리** — Postgres 가 진실 근원, 마크다운 파일은 미러 (D1, §17.3). git 은 export·diff·blame 백엔드.
- **v1 모델 (D13)** — LLM 3종 (OpenAI · Anthropic · Gemini), embedding 우선은 OpenAI `text-embedding-3-small` (1536d, Matryoshka 1024d truncate 옵션). 사용자 workspace 별 디폴트 + 에이전트별 오버라이드 (§4.4).

## 외부 공유용 / External-facing

- **[00-onepager.md](./00-onepager.md)** — 한 페이지 요약 (투자자·팀 합류 후보·파트너용). 비전 / 5 동사 / 페르소나 / 차별화 / 모델 / 로드맵 / 검증 게이트 / 결정 13개.

## 18개 섹션

| # | 제목 | 파일 |
|---|---|---|
| 1 | 비전과 문제정의 / Vision & Problem Statement | [01-vision.md](./01-vision.md) |
| 2 | 페르소나와 유스케이스 / Personas & Use Cases | [02-personas.md](./02-personas.md) |
| 3 | 컨셉 모델 / Conceptual Model | [03-conceptual-model.md](./03-conceptual-model.md) |
| 4 | 시스템 아키텍처 / System Architecture | [04-architecture.md](./04-architecture.md) |
| 5 | 에이전트 카탈로그 / Agent Catalog | [05-agent-catalog.md](./05-agent-catalog.md) |
| 6 | 슬래시 명령 명세 / Slash Command Spec | [06-slash-commands.md](./06-slash-commands.md) |
| 7 | UI/UX (옵시디언 유사) / Obsidian-like UI | [07-editor-ui.md](./07-editor-ui.md) |
| 8 | 데이터 모델 / Data Model (PostgreSQL 16+) | [08-data-model.md](./08-data-model.md) |
| 9 | 코드 구조 / Code Layout (TypeScript monorepo) | [09-code-layout.md](./09-code-layout.md) |
| 10 | IPC, 확장 경로 / IPC and Extension Paths | [10-extension-paths.md](./10-extension-paths.md) |
| 11 | 보안·권한·동기화 / Security, RBAC, Sync | [11-security-rbac.md](./11-security-rbac.md) |
| 12 | 옵저버빌리티·에이블·비용 / Observability, Evals, Cost | [12-observability.md](./12-observability.md) |
| 13 | 구현 가이드 / Implementation Guide for AI Coding Agents and Engineers | [13-implementation-guide.md](./13-implementation-guide.md) |
| 14 | 마일스톤·로드맵 / Milestones & Roadmap | [14-milestones.md](./14-milestones.md) |
| 15 | 수용 기준 / Acceptance Criteria (v1 GA) | [15-acceptance-criteria.md](./15-acceptance-criteria.md) |
| 16 | 위험 & 가설 / Risks & Assumptions | [16-risks.md](./16-risks.md) |
| 17 | 부록 / Appendix | [17-appendix.md](./17-appendix.md) |
| 18 | 구현 핸드오프 / Implementation Handoffs | [18-implementation-handoffs.md](./18-implementation-handoffs.md) |

## 단일 파일 버전

원본 단일 파일 버전 `../PRD-VelugaLore.md`는 분리 이전 백업입니다. 최신 내용은 이 디렉토리의 개별 섹션 파일들과 구현 스냅샷 `18-implementation-handoffs.md`에 있습니다.

## Changelog

### 2026-04-28 — S-08.5 desktop shell handoff 및 harness traceability 갱신
- **§13.7.6.1 추가** — S-08.5 현재 상태를 "Windows developer executable 생성 가능, installer/서명은 M5, 수동 `/draft` smoke는 미증명" 으로 명확히 기록.
- **§14.1 현재 상태 추가** — M0/M1에서 S-08.5로 이연된 데스크톱 셸/`/draft` 게이트가 아직 닫히지 않았음을 마일스톤 문서에 명시.
- **§18 handoff 추가** — S-08.5 문서·검증 스냅샷, harness validate/list/brief 확인 명령, 남은 acceptance 항목을 기록.
- **Agent registry/harness 갱신** — S-08.5 brief가 §18 handoff를 읽도록 `slices.json`에 연결하고, `.agents/agents.toml`의 role ownership을 현재 slice map과 정렬.

### 2026-04-26 — 외부 공유용 1-pager 추가 (`00-onepager.md`)
- 한 페이지 요약 — 비전 / Problem / Solution(compounding 3축) / 코어 5 동사 / 4 페르소나 / 차별화(vs Obsidian/Notion AI/Claude Code) / 모델·기술 / 24주 로드맵 / 5 가설 검증 / 핵심 결정 13개 / 함께할 분.
- 한국어 + 영문 병기, 인쇄 시 한 페이지 분량.
- 위치: `PRD/00-onepager.md`. README 상단에서 외부 공유용으로 링크.

### 2026-04-26 — 얕은 4 섹션 깊이 보강 (§9 · §11 · §12 · §16)
- **§9 Code Layout** — 패키지 책임 매트릭스(11개 패키지, 누가 누구를 import 하는지), 임포트 규칙 강제(CI 차단), 의존 그래프 ASCII, SemVer 안정 표면, 빌드/테스트 매트릭스(8개 산출물 × 서명), CI 워크플로우, 릴리스 채널(stable/beta/nightly), Codegen 정책, 부트스트랩 명령어 카탈로그.
- **§11 Security·RBAC·Sync** — FS-DB 2-phase write 7단계 시퀀스 + reconcile 알고리즘 + 부팅 시 reconcile, **충돌 머지 다이얼로그 mockup**(K/F/M/E 4 옵션), RLS 정책 SQL(`current_user_org_ids` 함수 + per-table 정책), Approval queue 카테고리별 정책, **비밀 패턴 카탈로그 10종**(AWS/GitHub/OpenAI/Anthropic/Stripe 등), SSO/SAML/SCIM, 감사 export, GDPR right-to-erasure.
- **§12 Observability·Evals·Cost** — OTEL 트레이스 스팬 트리 구조 + 표준 attribute, PII redaction 정책, **9개 메트릭** Prometheus/OTLP, eval 골든셋 YAML 형식 + scoring + LLM-as-judge 루브릭 + 한·영 분포 + GA 게이트(269+ 케이스), **비용 대시보드 mockup**(by agent / by model / top runs), budget 알림 정책 + per-agent 한도, 인라인 비용 UI, 5개 SLO.
- **§16 Risks** — 6개 위험 → **9개로 확장** (R7 over-curation 거절률, R8 Postgres SPOF, R9 i18n). 각 위험에 트리거 신호 + 4단계 완화 + 담당자 + 점검일. **5개 가설 검증 게이트** — H1~H5 각각 검증 시점·실험 설계·성공 기준·실패 시 분기 명시. 6개 가정(A.1~A.6) 명시 + 위반 시 영향. 검토 리듬 (매 마일스톤 + 분기).

### 2026-04-26 — 모델 provider 결정 (D13)
- **LLM 3종 1급 동봉 (D13)** — OpenAI · Anthropic · Gemini. 카테고리(가성비/품질/default)만 PRD 에 고정, 정확한 모델 ID 는 `workspace/.weki/config.toml` 과 README CHANGELOG 로 관리. 에이전트별 오버라이드 가능(예: `curate` 만 더 큰 모델).
- **Embedding default = OpenAI** — `text-embedding-3-small` (1536d). Matryoshka 차원 축소(1024d/256d) 옵션, 품질 1순위 시 `text-embedding-3-large` 1024d truncated 권장.
- **§4.4.1 신설 — LLM provider 표 + 에이전트별 권장 모델 매핑** + `make_agent` Python 예시 + `config.toml` 형식 + 비-목표(자체 모델 학습/자동 라우팅).
- **§4.4.2 신설 — Embedding provider 표** + 디폴트 결정 근거(비용·품질·차원).
- **§8.5.2 인덱스 크기 표** 1024d → 1536d 기준으로 갱신 (1024d truncated 컬럼 추가).
- **§8.5.3 embedding 표** OpenAI 우선으로 재작성, Matryoshka 차원 축소·`halfvec` quantization 정책.
- **§17.2 deps** LLM 3 provider + embedding 항목 추가, opencode "vendored" 표현 → "참조용; 코드 의존은 옵션".
- **§17.3 D13 결정 로그 신설.**

### 2026-04-26 — `vault` → `workspace` 용어 일괄 교체
- **15 파일 · 189 건** 일괄 변환 (대소문자·복수형·디렉토리 경로·테이블명·컬럼명·도구명 모두 포함).
- 본문: `vault 가 진실 근원` → `workspace 가 진실 근원` 등 한국어 본문 일괄 교체.
- 디렉토리: `vault/.weki/`, `vault/wiki/`, `vault/raw/` → `workspace/.weki/`, `workspace/wiki/`, `workspace/raw/`.
- DDL: 테이블 `vaults` → `workspaces`, 컬럼 `vault_id` → `workspace_id`. 인덱스명도 일괄.
- 도구명: `search_vault` / `grep_vault` / `glob_vault` → `search_workspace` / `grep_workspace` / `glob_workspace`.
- §17.1 용어집의 첫 항목 갱신: **Workspace** = 한 사용자/팀의 wiki 루트.
- 잔존 의도 — 이 CHANGELOG 의 *역사적 기록*(예: "grep_vault 신설" 섹션 제목, 본 항목 자체) 만 옛 이름 유지. 시간순 정확성 위함.

### 2026-04-26 — 4 섹션 깊이 구체화 (§13.6 · §5.5 · §7 mockup · §8.5)
- **§13.6 신설 — CurateAgent 깊은 명세** (8개 sub-section): 목적·범위 / 트리거 3종(사용자·compile·import 직후) / 결정 알고리즘 표 / 행동 규칙 DO·DON'T / **실패 모드 F1~F10** (false split, false merge, over-curation, 무한 루프, 외부 링크 깨짐, 백링크 손실, workspace 규칙 충돌 등) 완화 매핑 / 골든셋 시나리오 YAML 형식 / 롤백 inverse 매핑 / S-09b DOD 정밀화.
- **§5.5 신설 — 코어 5개 시스템 프롬프트 본보기**: `prompts/draft.md`, `prompts/improve.md`, `prompts/ask.md`, `prompts/ingest.md`, `prompts/curate.md` — frontmatter (id/output_schema/tools/mode) + 6 섹션 본문(역할/사용 시점/DO·DON'T/출력 형식/비-목표/예시). 사용자가 자기 workspace 에서 복제·수정 가능한 본보기.
- **§7.1.1 / §7.4.1 / §7.4.2 / §7.4.3 / §7.6.1 / §7.7 / §7.8 신설** — UI 목업: 전체 화면 레이아웃, slash menu 자동완성, diff preview (3-옵션 비교 + 키보드 1/2/3/A/R/E/P), curate preview (트리 변경 + risks 자동 점검), 모드 칩 시각, **Approval Queue 페이지 전체 목업**, 명령 팔레트.
- **§8.5 신설 — 인덱스 전략·크기·embedding·HNSW 마이그레이션** (6개 sub-section): 6개 인덱스 종류·용도, 1k/10k/100k/1M 노드별 인덱스 크기 추정, embedding 차원 선택 기준 (384/1024/1536/3072 trade-off, v1 디폴트 1024d bge-m3), ivfflat→HNSW 마이그레이션 zero-downtime 절차 (dual-write, CONCURRENTLY 빌드, 컷오버), HNSW m/ef_construction/ef_search 튜닝, **RRF 쿼리 EXPLAIN 형태**.

### 2026-04-26 — `grep_vault` 신설 (regex 검색 1급화)
- **§4.3.1 F-3 분할** — F-3a(grep_workspace, opencode Grep 직역) / F-3b(search_workspace, 의미+RRF) / F-3c(결정 규칙). 정확한 regex(깨진 link 패턴, 금칙어, frontmatter 패턴)가 *embedding 으론 못 찾는다* 는 점을 명시.
- **`grep_workspace` 인터페이스** — output_mode(content/files_with_matches/count), context lines, multiline, invert_match, whole_word, body_only, head_limit/offset. opencode Grep 과 거의 동일.
- **데스크톱 = ripgrep 직접 호출, 브라우저 = Postgres regex + pg_trgm 후보 좁힘.**
- **§5/§6 추가** — `grep` 시스템 작업 + `/grep` 슬래시 + 사용 예시 3종.
- **§10.4 화이트리스트** — `grep_workspace` T1/T2 호출 가능 도구로 등록.
- **§15** — A17.1 (ripgrep byte-equal), P5.1 (1만 노드 ≤ 200ms / 10만 ≤ 1s).

### 2026-04-26 — 검색·탐색·비교 도구 1급화 (§4.3.1 F · §10.4 · §5.2 · §6 · §15)
- **§4.3.1 F 강화** — opencode 의 Read/Glob/Grep/Edit/Write/MultiEdit 를 7개 sub-section(F-1~F-7)으로 매핑. 우리 검색은 Postgres `body_tsv`(literal) + `pg_trgm`(fuzzy) + `pgvector`(semantic) 3-way + **Reciprocal Rank Fusion** 으로 합성.
- **F-6 신설 (opencode 에 없는 능력)** — `compare_docs` / `find_duplicates` / `cluster_docs` / `rank_fusion` 4개 도구. 사규 vs 사규, 회의록 중복 탐지, 카테고리 자동 제안 같은 workspace 시나리오용.
- **§10.4 도구 화이트리스트 갱신** — 비교 도구 4종을 T1/T2 가 호출 가능한 정식 도구로 등록. 검색 도구도 RRF/JSONPath 필터/n-hop 그래프 옵션을 명시적으로.
- **§5.2 시스템 작업 추가** — `compare` · `duplicates` · `cluster` 신설. `compile` 이 야간에 `cluster`/`duplicates` 로 진단 → `curate` 제안 흐름.
- **§6.2.2 슬래시 매핑 + 예시** — `/compare`, `/duplicates`, `/cluster` 추가. `/find` 의 mode·JSONPath 예시 보강.
- **§15 수용기준** — A17~A20 (검색/비교/중복/클러스터 정확도) + P5~P8 (1만/10만 노드에서 응답 시간 게이트) 추가.

### 2026-04-26 — opencode 패턴 차용 구체화 (§4 · §10)
- **§4.3.1 패턴 매트릭스 재작성** — 9개 패턴을 [opencode 의 구현] · [우리가 빌리는 가치] · [우리 구현] 3-tuple 로 1:1 페어링 (A~J).
- **§4.3.2 옵션 차용 표 강화** — 후보 모듈마다 차용/자체구현 판정 한 줄. 모든 후보가 "자체 구현 우선" 으로 결론.
- **§4.3.3 자동화 정책 반전 신설** — opencode 의 "묻지 말고 실행" → 우리는 "patch 는 항상 approval", 4가지 디폴트 명시. (D11)
- **§4.1 다이어그램 업데이트** — Agent Workers 가 코어 5개 + 시스템 + 1st-party 확장으로 명시.
- **§10.2.0 AGENTS.md 형식 신설** — opencode 의 AGENTS.md 컨벤션을 *형식만* 차용해 조직 문서 규칙(용어집·톤·승인 정책)을 한 곳에. 실제 markdown 예시 포함. (D12)
- **§10.2.1 Skill 구체화** — `SKILL.md` 의 frontmatter trigger 방식, 자동 합류 조건. AGENTS.md vs Skill 차이(헌법 vs 조례).
- **§10.2.2 마크다운 정의 에이전트 구체화** — `agents.toml` 전체 예시 + `agents/<id>.md` 시스템 프롬프트 예시 + 동작 흐름 6단계.
- **§10.4 도구 화이트리스트 신설** — T1/T2 가 호출 가능한 19개 도구 카탈로그(읽기/검색/검증/외부/파싱/변환).
- **§10.5 등록 우선순위 강화** — workspace > org plugin > core 4단계 명시.
- **§17.3 결정로그 D11·D12 신설.**

### 2026-04-26 — Karpathy 비전 정렬 (코어 3 → 5)
- **§2 페르소나** — 1차/2차 코어 동사 칼럼 추가, 페르소나별 90일 동선 추가. P-ENT 의 1차 가치를 RBAC/감사 → `curate` (사규·정책 망 일관성 자동화) 로 재정의.
- **§2 유스케이스** — `/curate` (U3) 신설, compounding 3축 다이어그램 추가, U 번호 재배열.
- **§3 컨셉 모델** — "위키는 정보 아키텍처가 진화하는 살아있는 구조" 명제 명문화. §3.4 compounding 루프, §3.5 curate 가 만들 수 있는 변형들 신설.
- **§5 에이전트 카탈로그** — 코어 3개 → 5개. `ingest` 와 `curate` 를 시스템 작업에서 코어로 승격.
- **§6 슬래시** — 코어 매핑 5행, `/curate` 예시 추가.
- **§8.4 PatchOp** — `split_doc` / `merge_docs` / `move_doc` / `adopt_orphan` 4종 신설 + §8.4.1 invariants. `documents.kind` 에 `'stub'` 추가.
- **§13 슬라이스** — S-09 → S-09a(ingest+import) + S-09b(curate). 코어 5개 명시.
- **§14 마일스톤** — M2.5 (Curate) 신설, 일정 W10–W12, 후속 마일스톤 2주씩 후행.
- **§15 수용기준** — A12~A16 (Curate 안전성·트랜잭션·동의·Ingest fan-out·컴파운딩 정상동작) 추가, P2.1 추가.
- **§17 결정로그** — D7 갱신(코어 5개), D9·D10 신설.

### 2026-04-26 — 분리 작업
단일 PRD → 17 섹션 + README. 원본 `../PRD-VelugaLore.md` 는 분리 이전 백업.
