---
section: 13
title: "구현 가이드 (AI 코딩 에이전트 + 엔지니어용) / Implementation Guide for AI Coding Agents and Engineers"
parent: WekiDocs PRD
status: Draft (implementation-ready)
last_updated: 2026-04-26
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

> **편성 원칙** — 코어는 작게, 확장 인프라는 일찍. v1 GA 까지 새 에이전트를 *코드로* 추가하는 슬라이스는 코어 5개(`draft`/`improve`/`ask`/`ingest`/`curate`)뿐이다. 1st-party 확장 에이전트들은 §5.3 의 marketplace 형식(T2/T3)으로 작성되며, 슬라이스가 아니라 출시 컨텐츠로 분류된다.

| ID | 제목 | 의존 절 | DOD (Definition of Done) |
|---|---|---|---|
| **S-01** | 모노레포 부트스트랩 | §9 | `pnpm i && turbo run build` 통과, GH Actions 그린 |
| **S-02** | Postgres 스키마 v1 + drizzle 마이그레이션 | §8 | `pnpm db:reset && pnpm db:migrate` 그린, RLS 통합 테스트 통과 |
| **S-03** | 로컬 Workspace FS watcher + 2-phase write | §11.1 | 손편집·에이전트편집 동시성 테스트 100/100 통과 |
| **S-04** | CodeMirror 6 에디터 + 슬래시 메뉴 | §6, §7.4 | `/draft` 더미 명령이 정확히 파싱·렌더, 출처별 충돌 표시 |
| **S-05** | Agent daemon (자체 구현, opencode 패턴 참고) | §4.3, §10 | HTTP+SSE 헬스체크, 더미 에이전트 `echo` 실행. *opencode 코드 의존 없음.* |
| **S-06** | DraftAgent (코어 1) | §5.1, §4.4 | `/draft` 으로 빈 문서→개요+초안 또는 선택→확장, evals ≥ 0.8 |
| **S-07** | Patch preview + Approval queue | §8.4, §11.4 | 옵션 비교 UI, 키보드 적용/거절, audit_log 기록 |
| **S-08** | ImproveAgent (코어 2) + AskAgent (코어 3) | §5.1 | `/improve` 3옵션 readability 차이 측정, `/ask` 검색→qa 페이지 자동 저장 |
| **S-09a** | IngestAgent (코어 4) + import 시스템 작업 | §5.1, §2.2 U1·U2, §8.2 `import_runs` | PDF/URL/이미지 ingest 한 raw → 3~10 노드, docx/Notion/Confluence import (트리/링크 보존 ≥ 0.9) |
| **S-09b** | **CurateAgent (코어 5) + IA 변경 op** | §5.1, §3.5, §8.4.1 | `/curate scope:wiki/policies` 가 split/merge/move/adopt_orphan 제안, approval 후 적용. 한 run 통째로 revert, doc_versions 보존, 백링크 자동 재배치 100% |
| **S-10** | 시스템 작업: find + diff/blame/revert + lint | §5.2, §4.3.3 | 1만 노드 검색 p50 ≤ 500ms, doc_versions 비교, 한 줄 blame 100%, 깨진 링크 검출 |
| **S-11** | Markdown LSP 진단 + 분석↔편집 모드 토글 | §7.6, §10 | 1만 노드에서 빨간 밑줄 ≤ 200ms, 신규 workspace 는 analyze 기본 |
| **S-12** | RBAC + 멀티유저 | §11.2-3 | 권한 위반 통합테스트 100% |
| **S-13** | Web app v1 (read-mostly) | §4.2 | 데스크톱과 동일 workspace 를 브라우저에서 read+질의 |
| **S-14a** | **확장 인프라 T1+T2** (Skill / 마크다운 정의 에이전트) | §10.2.1, §10.2.2 | `workspace/.weki/skills/` 와 `agents/` 의 SKILL.md / `<id>.md` 만으로 신규 슬래시 명령 동작, 코드 0줄 검증 |
| **S-14b** | **확장 인프라 T3** (플러그인 SDK + 샘플 플러그인) | §10.2.3 | `tone-coach` 샘플이 마켓 매니페스트로 로드, 권한 화이트리스트 강제 |
| **S-14c** | **확장 인프라 T4** (MCP 호스트) | §10.2.4 | `workspace/.weki/mcp.toml` 등록, approval queue 통과 강제 |
| **S-15** | Triples 그래프 차후 토글 | §8.2, §7.5 | 옵션 켜면 v1 links 그대로 + triple view 추가 |
| **S-16** | Eval 회귀 + 비용 대시보드 | §12 | 코어 5개 + 시스템 작업 30 케이스, CI 차단 가능 |
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

## 13.6 S-09b · CurateAgent — 행동 규칙·실패 모드·골든셋 / CurateAgent deep dive

> **이 절은 S-09b 슬라이스의 *상세 명세* 다.** Curate 는 코어 5개 중 가장 위험한 동사(IA 변경, approval 필수)이고 가장 새로운 동사이므로, 행동 규칙과 실패 모드를 깊이 펼쳐 둔다. §3.5 (curate 가 만들 수 있는 변형) · §5.1 (코어 정의) · §8.4·§8.4.1 (IA op + invariants) 와 정합.

### 13.6.1 목적·범위 / Scope

- **목적** — wiki 의 *정보 아키텍처 자체* 를 진화시킨다. 카테고리 신설, 페이지 분할/합치기/이동, 고아 입양, 인덱스 재구성.
- **명시적 범위 밖** — 본문(텍스트) 수정. 그건 `improve` 의 일이다 (D10, §17.3).
- **출력** — 항상 `Patch{ ops:[IA ops only], rationale, preview_html, requires_approval=true }` (§8.4).
- **권한** — `read+restructure (approval 필수)` (§5.1, §11.4).

### 13.6.2 트리거 3종 / Three triggers

A. **사용자 명시 호출** — `/curate scope:wiki/policies` 또는 `/curate --since 7d --threshold 30`. **분석 모드에서도 실행 가능** (제안만 보고 적용 안 함, §7.6).

B. **`compile` 자동 트리거** — 야간 잡이 dirty 페이지 임계점 도달 시 curate 호출. 임계점은 `workspace/.weki/AGENTS.md` 의 §3 위키 구조 규칙(§10.2.0)에서 추출:
- 한 카테고리에 페이지 ≥ N (default 30)
- 평균 페이지 길이 > M 단어 (default 4000)
- 카테고리 인덱스 페이지 부재 + 페이지 ≥ 5
- 고아 페이지 비율 ≥ X% (default 5%)

C. **`/import` 직후 사전점검 (옵션)** — `find_duplicates` 결과 그룹 ≥ K (default 3) 이면 curate 자동 제안. 사용자가 import 흐름 안에서 그대로 검토.

### 13.6.3 결정 알고리즘 / Decision algorithm

curate 는 다음 *입력 신호 → 제안 op* 의 결정 트리를 실행한다.

| 입력 신호 | 도구 | 임계 | 제안 op | 근거 |
|---|---|---|---|---|
| 카테고리 페이지 부재 + cluster ≥ 5 | `cluster_docs` | k≥5, silhouette ≥ 0.4 | `create_doc(kind='index')` + `insert_link × N` | F-6, §3.5 |
| 거의 같은 노드 그룹 | `find_duplicates` | similarity ≥ 0.85 + tsvector overlap ≥ 0.7 | `merge_docs` (preserve_history=true) | F-6 |
| 페이지 길이 > 4000 단어 + 헤딩 ≥ 5 | `read_doc` + AST | 헤딩 간 임베딩 cosine < 0.6 | `split_doc(cuts=헤딩 경계)` | 자연 분할선 존재 시 |
| 한 카테고리 페이지 > 30 | `glob_workspace` + `cluster_docs` | sub-cluster ≥ 3 | `create_doc(kind='index', sub-folder)` + `move_doc × N` | 분류 진화 |
| 고아 (백링크 0) | `lint` | 임베딩 nearest index cosine ≥ 0.8 | `adopt_orphan(parent=index_id)` | F-4 위험 ↓ |
| path vs frontmatter.kind 불일치 | `glob_workspace` + frontmatter scan | 100% 명백 | `move_doc(new_path)` + `relink=true` | 분류 정합 |

**모든 신호는 *증거를 첨부* 한다.** rationale 에 "왜 이 op 를 제안하는지" 한국어 1~2줄 + 신호 점수 + 도구 호출 결과 ID. 사용자가 신호를 의심하면 도구 결과를 직접 열어볼 수 있어야 한다.

### 13.6.4 행동 규칙 (DO / DON'T) / Behavioral rules

#### DO

1. 본문(`replace_range` 등 텍스트 op)은 절대 출력하지 않는다 (D10, §17.3).
2. **AGENTS.md (§10.2.0) 의 §3 "위키 구조 규칙" 을 1차 기준으로 사용**. 우리의 알고리즘이 그 규칙과 충돌하면 우리 알고리즘이 진다.
3. 분석 모드에서는 patch 를 *제안만 만들고* 절대 적용하지 않는다 (§7.6).
4. 모든 op 는 `requires_approval=true`. 자동 적용 금지 (D11, A14).
5. 한 호출에서 만드는 모든 op 는 한 `agent_runs` 행에 묶인다 — 부분 적용 금지, 단일 revert 가능 (A13).
6. Stub redirect 가 기본 (§8.4.1 invariant 2). path tombstone 은 외부 링크 0 확인 후만.
7. doc_versions 에 변경 전 마지막 rev 가 있는지 확인. 없으면 force-snapshot 후 진행 (§8.4.1 invariant 1).
8. preview 에 변경 *전 트리* vs *후 트리* 차이를 시각적으로 노출 (사람이 동의 결정 가능해야 함).
9. 모든 op 의 *rationale* 에 신호 출처(`compare_docs(...)`, `cluster_docs(...)` 결과 ID) 첨부.

#### DON'T

1. 본문 텍스트 수정 — `replace_range`, `replace_section` 의 비-인덱스 영역 사용 금지.
2. 임베딩 *단독* 으로 merge 결정 — 1차(`embedding cosine ≥ 0.85`) + 2차 검증(`tsvector overlap ≥ 0.7` + 같은 frontmatter.kind) 둘 다 필요 (F2 위험).
3. 사용자 직접 작성 노드(`last_editor='human'`) 의 `move_doc` — 사용자 명시 동의 시에만 (DO #5 의 단일 트랜잭션과 충돌 시 op 제거).
4. AGENTS.md 의 명시적 보존 카테고리 (`wiki/legacy/`, `wiki/_archive/` 등) 안에서 op 생성.
5. 사용자가 직전에 거절한 op 를 *같은 scope·동일 입력* 으로 재제안 — 거절 history 를 `agent_runs.metadata.rejected_proposals` 에 누적, 30일간 동일 op 차단.
6. 5분 이상 작동 — abort + partial preview 반환 (사용자에게 무엇이 부족한지 보고).
7. 한 doc 에 시간당 IA op 누적 > 3 — 쿨다운 (F5 무한 루프 방지).
8. 한 호출에서 op > 50 — 너무 큰 변경. 자동 분할(여러 run) 또는 사용자 확인.

### 13.6.5 실패 모드 / Failure modes (F1~F10)

| ID | 실패 모드 | 발생 조건 | 사용자 영향 | 완화 |
|---|---|---|---|---|
| **F1** | False split | 헤딩이 의미적으로 분리되지 않는데 split 제안 | 부자연스러운 두 페이지 | 헤딩 간 임베딩 cosine < 0.6 일 때만 제안. preview 에 분할선의 의미 거리 점수 표시 |
| **F2** | False merge | 형식만 비슷, 의도적 별도 페이지를 합치려 함 | 의도된 구분 손상 | 임베딩 단독 금지 (DO #4 + tsvector overlap ≥ 0.7 + 같은 kind + 백링크 그래프 분리도 < 0.5) |
| **F3** | Over-curation (카테고리 폭주) | 임계점에 너무 민감, 매번 새 카테고리 제안 | 사용자 피로 + 신뢰 손상 | 거절률 > 30% 면 자동 트리거 임시 비활성 (사용자 명시 호출만 받음) |
| **F4** | 잘못된 고아 입양 | nearest index 가 사실 부적합 | 의미 흐림 | embedding cosine ≥ 0.8 + 사용자가 거절 시 negative training |
| **F5** | 무한 루프 (split → merge → split) | 결정 알고리즘이 다른 신호로 반복 활성 | 무용한 변경 누적 | 한 doc 의 IA op 누적 시간당 ≤ 3 (DON'T #7) |
| **F6** | 외부 링크 깨짐 | tombstone 으로 path free 후 외부(Slack/이메일/외부 wiki) 가 그 path 참조 | 외부 깨진 링크 | tombstone 사용 시 external link scan 후 0 확인 (§8.4.1 invariant 2) |
| **F7** | 백링크 손실 | id 기반은 안전하나 본문의 마크다운 `[[link]]` 자동 rewrite 실패 | 회색 링크 | rewrite 결과를 `grep_workspace '\[\[[^\]]+\]\]'` 로 검증, 100% 매칭 안 되면 abort |
| **F8** | workspace 규칙 충돌 | AGENTS.md 의 보존 정책 어김 | 신뢰 손상 | AGENTS.md 의 §3 규칙을 frontmatter 처럼 파싱 → curate 입력 시 lint, 위반 op 제거 |
| **F9** | 사용자 컨텍스트 오해 | 자유텍스트 의도 추출 실패 | 의도 외 변경 | 의도 추출 단계 출력 1줄을 preview 상단에 표시 — 사용자가 먼저 동의해야 op 생성 |
| **F10** | 데드락 (rev 충돌) | preview 생성 ↔ 적용 사이 사용자 편집 | 적용 실패 또는 데이터 불일치 | rev 검사 (§8.4.1 invariant 7), 충돌 시 머지 다이얼로그 + preview 재생성 옵션 |

### 13.6.6 골든셋 시나리오 형식 / Golden set scenario format

각 시나리오는 다음 YAML 로 작성, `tests/curate/golden/*.yaml` 에 30개 이상 보유 (S-09b DOD).

```yaml
id: curate-001
title: "policy 폴더 30+ 페이지, 카테고리 페이지 없음"
scope: wiki/policies
fixture: fixtures/curate-001/        # workspace 스냅샷 (50 노드)
agents_md_relevant_rules:
  - "한 카테고리 페이지 30 개를 넘으면 분할 제안"
  - "_index.md 는 모든 카테고리 폴더의 루트에 둔다"

invocation:
  slash: /curate scope:wiki/policies
  mode: edit                         # 또는 analyze (제안만)

expected_proposed_ops:
  - kind: cluster_docs               # 도구 호출
    expected_clusters_min: 4
  - kind: create_doc
    op_args:
      kind: index
      path: wiki/policies/_index.md
  - kind: insert_link
    count_min: 30                    # 인덱스 → children
  - kind: (선택) move_doc
    description: "분류가 명백히 어긋난 페이지는 sub-folder 로"

rationale_must_include:
  - "30개를 넘었다"
  - "AGENTS.md §3 규칙"

post_invariants_after_apply:
  - 모든 기존 페이지 백링크 정확도 100%       # F7
  - "_index.md 가 grep '/wiki/policies/[^/]+' 와 매칭"
  - 외부 링크 깨짐 0건                       # F6

post_invariants_after_revert:
  - 100% 원복 (body_sha256 동일)             # A13
  - 어떤 추가 commit 도 남지 않음

decision: approve | reject              # 골든 결정
expected_failure_mode: null              # 또는 F1~F10 중 하나 (실패 시나리오 골든셋)
```

골든셋 분포:
- 정상 시나리오: 24개 (각 결정 트리 행 × 시나리오)
- 실패 시나리오 (F1~F10): 6개 — 각 실패 모드에 대해 *완화가 작동하는지* 검증

### 13.6.7 롤백 시나리오 / Rollback semantics

`/revert run:<curate_run_id>` 는 다음을 자동 inverse 로 생성:

| 적용된 op | inverse op | 보장 |
|---|---|---|
| `split_doc` | `merge_docs` (보존된 doc_versions[rev_before] + stub redirect 제거) | body_sha256 동일 |
| `merge_docs` | `split_doc` (cuts = 원본 헤딩 경계, doc_versions 에서 복원) | 모든 원본 doc_id 복원 |
| `move_doc` | `move_doc` (방향 반대 + relink) | path 와 백링크 동일 |
| `adopt_orphan` | `remove_link` | parent index 의 link 제거 |
| `create_doc(kind='index')` | `delete_doc` | 단, 의존 op 가 없을 때만. 의존 있으면 *전체 run* 을 함께 revert |
| `update_index` / `replace_section('TOC')` | 이전 `body` 로 `replace_section` | 인덱스 페이지 원복 |

**revert 는 한 명령(`/revert run:<id>`)으로 100% 정확 inverse** (A13). 부분 revert 는 명시 옵션이 있을 때만 (`/revert run:<id> --ops 1,3,5`).

### 13.6.8 S-09b DOD 갱신 / DOD revisited

§13.3 의 S-09b 행을 다음으로 정밀화:

| 검증 항목 | 게이트 |
|---|---|
| 결정 알고리즘 7개 행 모두 골든셋 통과 | 골든셋 24/24 정상 ≥ 0.95 |
| 실패 모드 F1~F10 완화 작동 | 골든셋 6/6 통과 |
| 백링크 보존 (F7) | 골든셋 + fuzz 100/100 |
| revert 100% inverse (A13) | 골든셋 + body_sha256 동일 |
| approval 자동 적용 0건 (A14) | 1만 호출 fuzz |
| Preview 생성 시간 (P2.1) | 100노드 scope p50 ≤ 8s |
