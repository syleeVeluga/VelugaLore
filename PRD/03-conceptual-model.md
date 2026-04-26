---
section: 3
title: "컨셉 모델 / Conceptual Model"
parent: WekiDocs PRD
status: Draft (implementation-ready)
last_updated: 2026-04-26
---

# 3. 컨셉 모델 / Conceptual Model

## 3.0 핵심 명제 / The thesis

> **위키는 페이지의 집합이 아니라, *정보 아키텍처 자체가 진화하는 살아있는 구조* 다.**
> *A wiki is not a set of pages — it is a living information architecture that evolves.*

진짜 위키에서 사람들은 그때그때 새 카테고리를 만들고, 페이지를 분할하고, 분류를 바꾸고, 인덱스를 다시 그린다. WekiDocs 는 그 일을 사람이 *하지 않아도 되도록* 자동화하는 것이 아니라, **사람이 보고 동의하는 형태로 에이전트가 제안하도록** 만든다.

이 명제에서 코어 5개 동사 + 시스템 작업이 자연스럽게 도출된다:

- **`ingest`** — 자료를 들여 wiki 가 *자라남*
- **`curate`** — 자라난 wiki 의 *모양을 잡음* (카테고리 신설·페이지 분할/합치기·이동·고아 입양·인덱스 재구성)
- **`ask`** — wiki 를 *꺼내 씀* + 답이 새 페이지로 누적되어 다시 ingest 효과
- **`draft` / `improve`** — 사용자가 *직접 씀* (워드프로세서 동선)
- **`import`** (시스템) — 기존 자산을 wiki 노드로 *이관*

`ingest` + `curate` + `ask` 의 3축이 Karpathy 의 *"compounding"* 루프이고, `draft` / `improve` 가 비-테크 사용자(특히 P-STARTUP) 흡수를 위해 코어 옆에 붙는 워드프로세서 축이다. (페르소나별 1차 동사는 §2.1.)

## 3.1 Karpathy LLM Wiki 매핑 / Mapping the LLM Wiki idea

Karpathy의 비유 — *"Obsidian is the IDE; the LLM is the programmer; the wiki is the codebase."* — 를 WekiDocs 에서 다음과 같이 구체화한다.

| LLM Wiki 개념 | WekiDocs 구현체 |
|---|---|
| `raw/` (불변 소스) | `workspace/raw/` 디렉토리 + Postgres `raw_sources` 테이블. 에이전트는 read-only. |
| `wiki/` (LLM 산출물) | `workspace/wiki/` 디렉토리 + Postgres `documents` 테이블. 에이전트만 쓰기 가능 (사용자도 직접 편집 가능, 모드별 워크플로우 §11.2). |
| `index.md` | `documents WHERE kind='index'` + 자동 생성·갱신. graph view 의 노드 카탈로그. |
| `log.md` | `documents WHERE kind='log'`, append-only. 모든 에이전트 실행이 prefix `## [YYYY-MM-DD HH:MM] <verb> | <subject>` 로 자기 기록. |
| `[[wiki link]]` | 에디터 기본 문법. Postgres `links` 테이블에 정규화 저장. |
| Frontmatter (YAML) | `documents.frontmatter JSONB` 컬럼 (type, sources, related, confidence...). |
| "LLM as compiler" | 에이전트 그래프 = 빌드 그래프. Incremental: 변경된 raw/와 dirty wiki 만 재컴파일. |
| Schema 파일 (CLAUDE.md, AGENTS.md) | `workspace/.weki/AGENTS.md` (사람이 쓰는 에이전트 시스템 프롬프트). Git 추적. |

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
2. **Plan** — 오케스트레이터(pydantic-ai `Agent[CompileDeps, CompilePlan]`) 가 ingest → curate → relink → refresh 작업 DAG 를 산출.
3. **Execute** — 각 에이전트가 자기 도구만 호출(권한 분리). 결과는 항상 `Patch` 로 표현 (텍스트 직접 쓰지 않음).
4. **Apply** — 메인 프로세스가 patch 를 검증·적용·로그. 에이전트는 적용 권한이 없다. (human-in-the-loop 게이트, §11.4)
5. **Index** — `index.md` 와 `log.md` 가 마지막에 자동 갱신.

## 3.4 ingest → curate → ask 의 compounding 루프 / The compounding loop

```
                     (자라남)
                ┌──────── ingest ─────────┐
                │                          ▼
        raw 자료 ──────────────────▶ wiki 노드들
                                            │
                          (모양 잡기)        │
                      curate ◀──────────────┤   (사람이 직접 쓰기)
                      │     │                │     ▲
                      │     │                │     │  draft / improve
                      │     ▼                │     │
                      │  카테고리·분할·이동·인덱스 │
                      │                            │
                      └────────── ask ─────────────┘
                       (꺼내 쓰기 + 답이 새 페이지로 누적)
```

- **ingest** 가 raw → 노드(들)을 만든다. 한 raw 가 보통 3~10 노드를 건드린다(요약·엔티티·개념·갱신).
- **curate** 는 누적이 임계점을 넘으면 *모양* 을 다시 잡는다 — 새 카테고리 페이지, split/merge/move, 고아 입양, 인덱스 재구성. (위험 도구 → §11.4 approval 필수.)
- **ask** 는 위의 결과 위에서 답을 만든다. 답은 `kind='qa'` 페이지로 저장되어 다음 ingest 효과를 낸다(루프).
- **draft / improve** 는 사용자가 직접 쓸 때의 표면. 시스템적으로는 `replace_range` 류 PatchOp 만 만들기 때문에 위 루프와 직교한다 — 즉 **사용자의 직접 쓰기는 루프를 깨지 않는다**.

## 3.5 curate 가 만들 수 있는 변형들 / What `curate` is allowed to do

`curate` 의 출력은 다음 PatchOp 만 사용한다(§8.4):

| Op | 의미 | 예시 |
|---|---|---|
| `create_doc(kind='index')` | 새 카테고리/오버뷰 페이지 신설 | `wiki/policies/_index.md` |
| `split_doc` | 한 노드를 둘 이상으로 쪼개고 원래 자리에 부모 인덱스를 남김 | 거대해진 사규 한 페이지 → 장(章) 단위 |
| `merge_docs` | 같은 주제의 여러 노드를 하나로 통합 + 원래 경로는 stub redirect | 흩어진 결정사항 → 한 ADR |
| `move_doc` | 다른 카테고리/폴더로 이동 + 백링크 자동 재배치 | `wiki/inbox/foo` → `wiki/concepts/foo` |
| `insert_link × N` | 고아 노드 입양 (적절한 부모 인덱스에 연결) | 고아 페이지 → `_index` 의 children |
| `update_index` / `replace_section('TOC')` | 인덱스/오버뷰 갱신 | `index.md` 재구성 |

`curate` 는 절대 본문(텍스트) 자체를 수정하지 않는다. 그건 `improve` 의 일이다. **구조만 바꾼다** — 이 분리가 안전성과 사용자 신뢰의 핵심이다.
