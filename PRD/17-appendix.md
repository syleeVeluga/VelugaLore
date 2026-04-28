---
section: 17
title: "부록 / Appendix"
parent: VelugaLore PRD
status: Draft (implementation-ready)
last_updated: 2026-04-26
---

# 17. 부록 / Appendix

## 17.1 용어 / Glossary

- **Workspace**: 한 사용자/팀의 wiki 루트. 1개 workspace = 1개 Postgres `workspaces` 행 + 1개 폴더.
- **Raw**: 불변 원본 (PDF, URL 스냅샷, 이미지). 에이전트 read-only.
- **Wiki**: LLM 또는 사람이 만든 마크다운 노드. 백링크/태그/임베딩 보유.
- **Patch**: 에이전트가 제안하는 변경 묶음. 적용 전엔 미반영.
- **Slice**: 사용자에게 가치를 주는 PR 단위.

## 17.2 외부 의존 버전 핀 / Pinned external deps

### 17.2.1 라이브러리·플랫폼

- Tauri 2.x · React 19 · Next.js 15 · CodeMirror 6 · ProseMirror 1.x
- PostgreSQL 16 · pgvector 0.8 · pg_trgm
- pydantic-ai ≥ 1.70 · pydantic 2.x
- opencode ≥ 1.3.0 (참조용; 코드 의존은 옵션, §4.3.2)

### 17.2.2 LLM provider (D13)

| Provider | 카테고리 | v1 권장 (모델 ID 는 README CHANGELOG 에서 갱신) |
|---|---|---|
| **OpenAI** | 가성비 | `gpt-4o-mini` 또는 그 시점 최신 mini |
| **OpenAI** | 품질 | `gpt-5` 류 (provider 최상위) |
| **Anthropic** | 가성비 | `claude-haiku-4-5` |
| **Anthropic** | 품질 | `claude-sonnet-4-6` 또는 `claude-opus-4-6` |
| **Google Gemini** | 가성비 | `gemini-2.5-flash` |
| **Google Gemini** | 품질 | `gemini-2.5-pro` 류 |

### 17.2.3 Embedding provider (D13)

- **v1 default**: OpenAI `text-embedding-3-small` (1536d, 또는 truncated 1024d)
- 품질 1순위 옵션: `text-embedding-3-large` (3072d 또는 truncated)
- v1.5+ 옵션: Voyage / Cohere / 로컬 `bge-m3-onnx`

## 17.3 결정 로그(요약) / Decision log

- D1 · "Postgres 가 진실 근원" — 파일은 미러. 이유: 멀티유저·인덱스·RLS·감사. (vs Obsidian 의 file-first)
- D2 · "Tauri (Rust) > Electron" — 메모리, 보안, 코어 LSP/FS 모듈 재사용성.
- D3 · "Python 워커 분리" — pydantic-ai 의 본가. TS 포팅 대신 IPC.
- D4 · "Patch is the only currency" — 에이전트가 직접 쓰면 audit/approve 가 무너진다.
- D5 · "v1 graph = simple links, triples 는 차후" — 가치 검증 전 RDF 도입은 과잉.
- D6 · "opencode 는 레퍼런스, 코드 의존은 옵션" — 라이선스/업스트림 추적/패치 부담 회피, 패턴만 흡수해 자체 구현 (§4.3).
- D7 · "코어 에이전트는 5개" — Karpathy compounding 3축(`ingest`/`curate`/`ask`) + 사용자 직접 쓰기 2개(`draft`/`improve`). 더 정교한 동사는 모두 §10.2 의 4단계 확장 경로로 (§5).
- D8 · "확장 인프라 우선" — 1st-party 확장 에이전트도 같은 형식(T2/T3)으로 작성해, 사용자 정의 에이전트가 처음부터 1급 시민이 되도록 (§10.2).
- D9 · "ingest ≠ curate" — `ingest` 는 *추가*(낮은 위험, 자동), `curate` 는 *구조 변경*(높은 위험, approval 필수). 책임 분리가 안전성·재사용성·테스트성을 모두 개선 (§5.1, §3.5).
- D10 · "curate 는 본문을 안 건드린다" — 본문 수정은 `improve` 의 일. `curate` 는 오로지 정보 아키텍처 op(`split_doc`/`merge_docs`/`move_doc`/`adopt_orphan`/`create_doc(kind=index)`/`update_index`/`replace_section('TOC')`)만 사용 (§8.4).
- D11 · "자동화 정책은 opencode 의 *반대*" — opencode 는 "묻지 말고 실행" 디폴트, 우리는 "patch 는 항상 approval 통과" 디폴트. 사용자 다수가 비-테크, 데이터는 회사 자산, 실수 비용이 코드보다 크다. 신규 workspace 기본 모드는 `analyze`. (§4.3.3)
- D12 · "AGENTS.md 형식만 빌리되 도메인은 다르다" — opencode 의 AGENTS.md 는 코드 컨벤션 문서. 우리는 같은 위치(`workspace/.weki/AGENTS.md`)에 *조직 문서 규칙*(용어집·톤·기본 모드·승인 정책)을 둔다. 모든 코어/확장 에이전트의 시스템 프롬프트 앞에 자동 prepend. (§10.2.0)
- D13 · "v1 GA provider = OpenAI · Anthropic · Gemini, embedding 우선 = OpenAI" — 3개 LLM provider 를 1급 동봉, 사용자 workspace 별 디폴트·에이전트별 오버라이드 가능. 모델 자동 라우팅은 v1.5+ (사용자 명시 선택권 우선). embedding v1 default = OpenAI `text-embedding-3-small` (1536d, Matryoshka 차원 축소 1024d 옵션). 다른 provider 는 v1.5+ 토글. 모델 ID 라인업은 자주 변하므로 PRD 는 *카테고리* 만 고정, 실제 ID 는 README CHANGELOG 와 `workspace/.weki/config.toml` 로 관리. (§4.4.1, §4.4.2, §8.5.3)

## 17.4 라이선스·인용 / Licensing & attribution

- 본 PRD 영감: Andrej Karpathy의 LLM Wiki gist 442a6bf...; anomalyco/opencode (MIT); pydantic/pydantic-ai (MIT); Obsidian (proprietary, 영감만).
- VelugaLore 자체는 Apache-2.0 (앱), MIT (플러그인 SDK·예제).

## 17.5 공개 인용 / Public quote (≤15 words)

- "Obsidian is the IDE; the LLM is the programmer; the wiki is the codebase."

---

*— end of PRD v0.1.0-draft —*
