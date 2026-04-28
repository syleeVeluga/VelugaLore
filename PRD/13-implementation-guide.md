---
section: 13
title: "구현 가이드 (AI 코딩 에이전트 + 엔지니어용) / Implementation Guide for AI Coding Agents and Engineers"
parent: VelugaLore PRD
status: Draft (implementation-ready)
last_updated: 2026-04-28
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
| **S-01** | [x] 모노레포 부트스트랩 | §9 | `pnpm i && turbo run build` 통과, GH Actions 그린 |
| **S-02** | [x] Postgres 스키마 v1 + drizzle 마이그레이션 | §8 | `pnpm db:reset && pnpm db:migrate` 그린, RLS 통합 테스트 통과 |
| **S-03** | [x] 로컬 Workspace FS watcher + 2-phase write | §11.1 | 손편집·에이전트편집 동시성 테스트 100/100 통과 |
| **S-04** | [x] CodeMirror 6 에디터 + 슬래시 메뉴 | §6, §7.4 | `/draft` 더미 명령이 정확히 파싱·렌더, 출처별 충돌 표시 |
| **S-05** | [x] Agent daemon (자체 구현, opencode 패턴 참고) | §4.3, §10 | HTTP+SSE 헬스체크, 더미 에이전트 `echo` 실행. *opencode 코드 의존 없음.* |
| **S-06** | [x] DraftAgent (코어 1) | §5.1, §4.4 | `/draft` 으로 빈 문서→개요+초안 또는 선택→확장, evals ≥ 0.8 |
| **S-07** | [x] Patch preview + Approval queue | §8.4, §11.4 | 옵션 비교 UI, 키보드 적용/거절, audit_log 기록 |
| **S-08** | [x] ImproveAgent (코어 2) + AskAgent (코어 3) | §5.1 | `/improve` 3옵션 readability 차이 측정, `/ask` 검색→qa 페이지 자동 저장 |
| **S-08.5** | [ ] Desktop shell catch-up: 첫 실행 가능한 데스크톱 빌드 | §4.1, §7.1, §9.1, §11.1 | Tauri 2 셸 + React 렌더러 스캐폴드, 빈 workspace 열기 + `/draft` 한 번으로 .md 생성 (`packages/editor` 임베드 + S-07 승인 큐 + S-03 2-phase write 통과). 자세한 명세는 §13.7 |
| **S-08.6** | [ ] Real LLM provider runtime | §4.4, §5.1, §11.5, §12, §13.7.9 | 정상 runtime 은 `OPENAI_API_KEY` · `ANTHROPIC_API_KEY` · `GOOGLE_API_KEY` 3종 preflight 필수. `agent-server` 는 TS 결정적 스캐폴딩 대신 `agent-runtime-py` pydantic-ai 워커를 호출하고, `/draft` live LLM patch 가 approval queue + 2-phase write smoke 를 통과 |
| **S-09a** | IngestAgent (코어 4) + import 시스템 작업 | §5.1, §2.2 U1·U2, §8.2 `import_runs` | PDF/URL/이미지 ingest 한 raw → 3~10 노드, docx/Notion/Confluence import (트리/링크 보존 ≥ 0.9) |
| **S-09b** | **CurateAgent (코어 5) + IA 변경 op + 수동 페이지/폴더 관리** | §5.1, §3.5, §7.1.2, §8.4.1 | `/curate scope:wiki/policies` 가 split/merge/move/adopt_orphan 제안, approval 후 적용. 사용자는 파일트리에서 페이지/폴더 생성·이름변경·이동·복제·보관·복원을 직접 수행. 한 run 통째로 revert, doc_versions 보존, 백링크 자동 재배치 100% |
| **S-10** | 시스템 작업: find + diff/blame/revert + lint | §5.2, §4.3.3 | 1만 노드 검색 p50 ≤ 500ms, doc_versions 비교, 한 줄 blame 100%, 깨진 링크 검출 |
| **S-11** | Markdown LSP 진단 + 분석↔편집 모드 토글 | §7.6, §10 | 1만 노드에서 빨간 밑줄 ≤ 200ms, 신규 workspace 는 analyze 기본 |
| **S-12a** | Solo 세션 정체성 + dev act-as 토글 | §11.2-3, §13.8 | Solo 모드 디폴트, `app.user_id` 미들웨어 + RLS 유지, dev-only 역할 임퍼소네이션, 프로덕션 빌드에서 act-as 경로 strip |
| **S-12b** | Team/Enterprise 멀티유저 (SSO/SCIM/멤버 UI) | §11.2-3 | 권한 위반 통합테스트 100%, OAuth/SAML/SCIM, Solo→Team 무이주 전환 |
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
- **수동 관리 기본값** — 사용자는 Notion/Obsidian 처럼 파일트리에서 페이지·폴더를 직접 생성, 이름변경, 이동, 복제, 보관, 복원할 수 있다(§7.1.2). 이 흐름은 `curate` 의 자동 제안이 아니라 사람의 직접 조작이다.
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

### 13.6.3.1 수동 페이지·폴더 관리 기본 / Manual page & folder management baseline

S-09b 는 에이전트가 IA op 를 제안하는 기능만으로 끝나면 안 된다. 사용자는 AI 없이도 좌측 파일트리에서 다음을 자연스럽게 수행할 수 있어야 한다.

- 새 페이지 생성: 선택한 폴더 아래 `.md` 생성, 즉시 제목 편집, 빈 본문에서 `/draft` 가능.
- 새 폴더 생성: `folder/_index.md` (`kind='index'`) 를 만들어 빈 폴더도 DB/FS/검색/graph 에서 일관되게 표현.
- 이름 변경: path/title 동시 갱신, 충돌명 검사, `[[wiki link]]` rewrite preview.
- 이동: drag/drop 또는 `Move to...`; 내부 구현은 `move_doc(relink=true)` 와 같은 백링크 보존·stub 정책을 공유.
- 복제: 새 `doc_id` 와 path 를 부여하고 import 메타데이터는 제거.
- 삭제/보관: 기본은 `wiki/_archive/` 로 이동. 영구 삭제는 별도 confirm 과 외부 링크 0 확인 후만 허용.
- 복원: archive 또는 `/diff`/`/revert` 에서 원래 path/body 복원.
- 태그·kind·frontmatter 편집: 문서 상단 속성 행 또는 side panel 에서 수정, `document_tags` 와 `documents.frontmatter` 동기화.

이 흐름은 `curate` 가 만든 Patch 가 아니므로 approval queue 를 기본으로 타지 않는다. 대신 사람의 직접 조작으로 audit_log 에 기록되고, §11.1 2-phase write 와 `doc_versions` 를 반드시 통과한다. 분석 모드에서는 파일 열기·검색·graph/backlink 탐색만 허용하고, 위 구조 조작은 disabled 상태로 보인다.

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
| 수동 페이지/폴더 관리 기본값 (A14.1) | 새 페이지/폴더, rename, drag/drop move, duplicate, archive/delete, restore, tag/kind edit 브라우저/컴포넌트 smoke 100% |
| Preview 생성 시간 (P2.1) | 100노드 scope p50 ≤ 8s |

---

## 13.7 S-08.5 · Desktop shell catch-up — 첫 실행 가능한 데스크톱 빌드 / Desktop shell catch-up deep dive

> **이 절은 S-08.5 슬라이스의 *상세 명세* 다.** S-01~S-08은 모두 백엔드/라이브러리 슬라이스로 진행되어 사용자가 실제로 클릭해서 검증할 수 있는 산출물이 부재한 상태다. S-08.5는 그동안 만든 라이브러리들을 한 번에 묶어 **사람이 손으로 `/draft` 흐름을 끝까지 통과시키는 첫 번째 데스크톱 빌드**를 만든다. M0 게이트(§14 "데스크톱 셸이 빈 workspace 열기")와 M1 사용성 게이트("`/draft` 5분 안에 성공")를 동시에 닫는다.

### 13.7.1 배경 / Why this slice exists

S-01~S-08의 진행 결과:

- ✅ `core` 스키마·patch 로직·slash 파서 (S-01)
- ✅ `db` 스키마·RLS·migrations (S-02)
- ✅ `desktop` 워크스페이스 sync 라이브러리 (FS watcher + 2-phase write, S-03)
- ✅ `editor` CodeMirror 6 + slash menu (S-04)
- ✅ `agent-server` HTTP+SSE 데몬 (S-05)
- ✅ `agent-runtime-py` Draft/Improve/Ask 에이전트 (S-06, S-08)
- ✅ Patch preview + Approval queue (S-07)

**없는 것** — Tauri 셸. `packages/desktop/`에 Rust 코어(`src-tauri/`)도, React 렌더러도 없어서 위 라이브러리들이 **사용자 손에 닿지 않는다**. M0 게이트(빈 셸 동작)가 슬라이스 카탈로그에 매핑되지 않은 채 M2까지 와버린 결과다.

S-08.5는 *vertical slice 우선* 원칙(§13.2)을 지키기 위해 "Tauri 셸 스캐폴드"가 아니라 **"사용자가 데스크톱에서 처음으로 글쓰기 1회를 완수하는 흐름"** 으로 정의된다.

### 13.7.2 범위 / Scope

#### IN scope

1. **Tauri 2.x 셸 스캐폴드** — `packages/desktop/src-tauri/` (Rust), `tauri.conf.json`, `Cargo.toml`. 의존: `tauri`, `tokio`, `serde`, `notify` 만 (§9.3 강제).
2. **렌더러 스캐폴드** — `packages/desktop/src/renderer/` (React 19 + Vite). 3-pane 레이아웃의 *최소형* (§7.1.1 목업의 부분집합):
   - 가운데: 에디터 1개 (탭/분할 없이)
   - 좌측: 파일트리 1개 (검색·태그 없이)
   - 우측: 에이전트 패널 + 승인 큐 (백링크/그래프/아웃라인 없이)
3. **기존 라이브러리 임베드** — `@weki/core`, `@weki/editor`, `@weki/desktop`(workspace-sync) 임포트.
4. **IPC 1세트** — Tauri commands: `open_workspace(path)`, `read_doc(path)`, `apply_patch(patch)`, `list_pending_approvals()`. 이벤트: `doc_changed`, `agent_run_progress`. (§10.2.1 *Renderer ↔ Core (Rust)* 정합)
5. **에이전트 데몬 spawn** — Tauri Rust 코어가 `agent-server` 바이너리를 sub-process로 띄우고 HTTP+SSE 로컬 포트(127.0.0.1:`$ephemeral`) 잡기.
6. **로컬 dev 빌드만** — `pnpm --filter @weki/desktop dev` 로 빈 창 + 핫리로드 동작. **서명·notarization·CI 릴리스 빌드는 본 슬라이스 범위 밖** (M5/S-16에서).

#### OUT of scope (명시적)

- 그래프뷰(`@weki/graph`), 백링크 패널, 아웃라인, 명령 팔레트(`Cmd+K`), 탭/분할 — §7.1 "3-pane 기본"의 우측·좌측 풍부한 기능들은 추후 슬라이스에서.
- 분석 모드(§7.6) 토글 — S-11에서.
- 멀티 workspace, 자동 업데이트, 텔레메트리 옵트인 UI — 후속.
- Web 미러(`packages/web`) — S-13.
- Markdown LSP 진단 표시 — S-11.
- 임포트 UI(`/import`) — S-09a.

### 13.7.3 사용자 흐름 (DoD의 인간 검증) / End-to-end user flow

DoD를 만족하려면 다음 9단계가 사람의 손으로 1회 통과되어야 한다:

1. `pnpm --filter @weki/desktop dev` 실행 → Tauri 창이 뜬다 (로딩 스플래시 허용).
2. "Open Workspace" 다이얼로그에서 빈 디렉터리 선택 → workspace_root 기록, `.weki/` 자동 생성, `agent-server` sub-process 기동.
3. 좌측 파일트리에 빈 상태가 표시 → "New Note" 버튼 또는 우클릭 → `Untitled.md` 생성 (rev=1, body="").
4. 가운데 에디터가 `Untitled.md`를 연다 → 커서 위치 가능.
5. `/` 입력 → 슬래시 메뉴 (S-04) 표시 → `/draft` 선택 → 인자 입력(예: "근태 관리 규정 초안 작성").
6. 우측 패널이 *agent_run* 진행 표시 (SSE) → 완료 시 patch preview 표시 (S-07).
7. 키보드(`Cmd/Ctrl+Enter`)로 patch 승인 → 2-phase write (S-03) 실행 → 디스크에 `Untitled.md` 저장.
8. 에디터 본문이 새 rev(=2)로 갱신 → 좌측 파일트리에 변경 표시(●).
9. 사용자가 외부 에디터(VSCode)에서 같은 `.md` 열기 → 동일 내용 확인. 외부 편집 → S-03 watcher가 `doc_changed` 이벤트 → 렌더러 갱신.

이 흐름이 끝까지 통과되면 **M0의 "빈 workspace 열기" + M1의 "`/draft` 사용성"** 두 게이트가 동시에 닫힌다.

### 13.7.4 IPC 표면 / IPC surface (Tauri commands & events)

| 방향 | 이름 | 인자 | 응답/페이로드 | 비고 |
|---|---|---|---|---|
| cmd | `open_workspace` | `{ path: string }` | `{ workspace_id, root, agent_server_port }` | `.weki/` 생성, sub-process 기동 |
| cmd | `list_documents` | `{}` | `Document[]` | `WorkspaceDocumentRecord` 매핑 |
| cmd | `read_doc` | `{ doc_id }` | `{ body, rev, body_sha256 }` | DB 통한 read |
| cmd | `create_doc` | `{ path, body? }` | `Document` | rev=1, last_editor='human' |
| cmd | `apply_patch` | `{ run_id, decision: 'approve'\|'reject' }` | `{ status, document? }` | S-07 큐 통과 |
| cmd | `list_pending_approvals` | `{}` | `PendingApproval[]` | S-07 |
| event | `doc_changed` | `{ doc_id, rev, source: 'agent'\|'human'\|'sync' }` | — | watcher 또는 IPC |
| event | `agent_run_progress` | `{ run_id, phase, message?, patch_preview? }` | — | SSE → renderer |
| event | `agent_run_completed` | `{ run_id, patch_id?, error? }` | — | — |

모든 commands 는 [packages/desktop/src-tauri/src/ipc/mod.rs](packages/desktop/src-tauri/src/ipc/mod.rs) (신규)에 단일 등록. JSON 직렬화는 `core` zod 스키마 + Rust 측 `serde::Deserialize`로 양측 정합.

### 13.7.5 의존성 / Dependencies

#### Rust (`packages/desktop/src-tauri/Cargo.toml`)
- `tauri = "2"`
- `tokio = { version = "1", features = ["full"] }`
- `serde = { version = "1", features = ["derive"] }`
- `serde_json = "1"`
- `notify = "6"` (S-03 watcher와 별도, Rust 측 셸용)
- 그 외 추가 금지 (§9.3).

#### TS 렌더러 (`packages/desktop/package.json` devDependencies 추가)
- `react`, `react-dom` (19.x)
- `@tauri-apps/api`, `@tauri-apps/cli`
- `vite`, `@vitejs/plugin-react`

`dependencies`에는 `@weki/core`, `@weki/editor`는 이미 있음. workspace-sync 코드는 같은 패키지 내부라 별도 import 없이 사용.

#### 사용자 환경 사전 요구
- Rust toolchain (`rustup`, stable)
- Tauri 2 CLI (`pnpm dlx @tauri-apps/cli@2`)
- 플랫폼별: macOS Xcode CLI, Windows WebView2(기본 설치됨), Linux `webkit2gtk`/`libsoup` 등

`packages/desktop/README.md` (신규)에 위 사전 요구를 명시. 본 슬라이스에서는 **로컬 dev 빌드만 보장하고 CI 빌드는 건드리지 않는다** (서명·OS 매트릭스는 §9.4.1 그대로 M5에서).

### 13.7.6 DoD / Definition of Done

| 항목 | 게이트 |
|---|---|
| 빌드 | `pnpm --filter @weki/desktop dev` 가 macOS 또는 Windows에서 빈 Tauri 창을 띄운다 |
| Workspace 열기 | 임의의 빈 디렉터리를 열면 `.weki/`가 생성되고 `agent-server`가 spawn 된다 |
| `/draft` 흐름 | §13.7.3 의 9단계가 사람 손으로 1회 통과 |
| 2-phase write 정합 | 승인된 patch는 §11.1 절차로 디스크 반영, body_sha256 일치 |
| 외부 편집 동기화 | 외부 에디터 변경이 5초 내 렌더러에 반영 (S-03 watcher 경유) |
| IPC 정합 | §13.7.4 표의 8개 surface가 모두 등록·테스트됨 |
| 의존성 정책 | §9.3 Rust 의존 화이트리스트만 사용, `pnpm lint:deps` 통과 |
| Component 테스트 | 새 React 컴포넌트는 Playwright Component (§9.4.2)에서 렌더 1건 이상 |
| Smoke 문서 | [packages/desktop/README.md](packages/desktop/README.md) 에 사전 요구 + 실행 절차 + 트러블슈팅 5건 |

#### 명시적으로 OUT of DoD

- 서명된 release 아티팩트 (M5, §9.4.1)
- 4 OS 매트릭스 CI (M5)
- E2E (Playwright + Tauri driver, §9.4.2) — `release 전` 게이트로 기존 정책 그대로 유지, 본 슬라이스에서는 smoke만
- 디자인 토큰·테마·다크모드 — 후속 UX 슬라이스
- 에이전트 패널 풀 기능(히스토리, re-run UI 등) — S-09a 이후

### 13.7.6.1 2026-04-28 구현 상태 스냅샷 / Implementation status snapshot

S-08.5는 현재 **개발자용 Windows 실행 파일을 만들 수 있는 상태까지 확인**되었지만, §13.7.3의 사람 손 9단계 smoke 전체가 아직 닫힌 것은 아니다. 따라서 §13.3 카탈로그의 S-08.5 완료 표시는 `[ ]` 로 유지한다.

확인된 범위:

- `packages/desktop`에 React/Vite renderer, Tauri 2 `src-tauri`, IPC contract, renderer smoke tests, production guard script, `packages/desktop/README.md`가 존재한다.
- Windows developer test executable은 `pnpm --filter @weki/desktop exec tauri build` 로 생성 가능하며, 현재 산출물 기준 경로는 `packages/desktop/src-tauri/target/release/weki-desktop.exe` 다.
- `tauri.conf.json`의 bundler는 비활성화되어 있어 MSI/NSIS installer는 아직 만들지 않는다. 설치형 산출물, 서명, notarization은 M5 release hardening 범위다.
- 현재 `@weki/agent-server` 경로는 Patch/ReadOnlyAnswer 계약과 approval 흐름을 검증하기 위한 결정적 테스트 스캐폴딩에 머물러 있다. 이는 제품 acceptance 가 아니라 누락된 핵심 게이트이며, S-08.6에서 실제 pydantic-ai provider runtime 으로 교체해야 한다.

아직 미증명인 S-08.5 acceptance:

- `/draft` slash command부터 patch preview, 승인, 디스크 반영까지 이어지는 §13.7.3 9단계 수동 smoke.
- 승인된 patch의 2-phase write 결과와 `body_sha256` 일치.
- 외부 markdown 편집이 S-03 watcher를 통해 5초 안에 renderer로 전파되는지.

### 13.7.7 위험과 완화 / Risks

| 위험 | 영향 | 완화 |
|---|---|---|
| Tauri 2 + React 19 + Vite 호환 이슈 | 빌드 안 됨 | 슬라이스 첫 1일에 hello-world 빈 창부터 검증, 막히면 React 18로 다운 |
| `agent-server` sub-process가 OS별로 path 다름 | macOS만 동작 | Tauri sidecar 메커니즘 사용, 플랫폼별 바이너리 등록 |
| FS watcher가 Windows에서 5초 디바운스 부정확 | 외부 편집 반영 지연 | S-03의 `NodeWorkspaceFileMirror` 그대로 사용 (이미 Windows 검증됨), Tauri 측은 import만 |
| 슬라이스 범위 폭주 | M2 일정 추가 지연 | OUT of scope 항목들을 IDE에서 *상시 가시화*, 새 기능 요구는 별도 issue로 |
| 사용자 환경(Rust toolchain 부재) | 첫 실행 실패 | README에 명시 + `pnpm --filter @weki/desktop dev` 가 toolchain 부재 시 친절한 에러 메시지 |

### 13.7.8 후속 슬라이스에 미치는 영향 / Downstream impact

S-08.5 머지 후:

- **S-08.6 (Real LLM runtime)** — desktop shell 이 생겼으므로 실제 OpenAI/Anthropic/Gemini provider key preflight 와 pydantic-ai agent 호출을 사용자 흐름 안에서 검증한다.
- **S-09a (Ingest)** — Ingest UI (drag-drop, URL 입력)를 셸 안에서 검증 가능. 추가 IPC: `start_ingest({ source })`.
- **S-09b (Curate)** — IA 변경 preview를 셸의 우측 패널에서 시각 검증.
- **S-10/S-11** — 검색 UI, LSP 진단 밑줄을 같은 셸에 추가.
- **S-13 (Web v1)** — 본 슬라이스가 정한 IPC 표면을 HTTP API로 미러링. Web과 Desktop이 공유하는 *UI primitive set* 의 출발선.

---

### 13.7.9 S-08.6 · Real LLM provider runtime 보정 / Real LLM provider runtime correction

> **이 절은 S-08.6 슬라이스의 상세 명세다.** S-08.5는 데스크톱 셸과 approval-first `/draft` 동선을 묶는 통합 슬라이스였지만, 현재 agent output 은 실제 LLM 이 아니라 결정적 스캐폴딩이다. VelugaLore 의 제품 비전은 “AI agent 가 문서 워크플로우를 수행한다” 이므로, 이 상태로는 M1/M2의 `/draft` 사용성 게이트를 닫을 수 없다.

#### 목적 / Purpose

- `draft`/`improve`/`ask` 의 정상 runtime 을 `agent-runtime-py` pydantic-ai 워커로 이동한다.
- OpenAI · Anthropic · Google Gemini 3종 provider 를 모두 first-class 로 preflight 한다.
- 기본 LLM provider 는 Google Gemini, 현재 기본 모델은 `gemini-2.5-flash-lite` (`google-gla`) 로 둔다.
- 기존 Patch/ReadOnlyAnswer 계약, approval queue, 2-phase write 는 그대로 유지한다.

#### IN scope

1. **Provider preflight** — 정상 runtime 시작 전 `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY` 3종 존재를 검사. 하나라도 없으면 core agent 실행 불가.
2. **Python runtime 호출** — `agent-server` 는 `/runs` 처리 시 TS 결정적 함수 대신 `agent-runtime-py` 의 pydantic-ai entrypoint 를 subprocess/JSON-RPC 로 호출한다.
3. **구조화 출력 검증** — Python 워커는 pydantic-ai 출력 → Pydantic 모델 → JSON → `@weki/core` zod schema 순서로 검증한다. 실패 시 patch 를 제안하지 않는다.
4. **모델/비용 기록** — provider/model, token usage, 비용 추정이 가능하면 `agent_runs.model`, `cost_tokens`, `cost_usd_microcents` 에 기록한다.
5. **명시적 테스트 모드** — 결정적 출력 또는 pydantic-ai TestModel 은 `WEKI_AGENT_RUNTIME=test` 같은 명시적 플래그에서만 허용한다. 키 누락 자동 fallback 은 금지.

#### OUT of scope

- 키 저장용 OS keychain UI 완성. S-08.6은 환경변수 preflight 를 닫고, keychain UX 는 §11.5 보안 저장 정책의 후속 구현으로 둔다.
- 전체 5개 코어 에이전트의 품질 튜닝. S-08.6의 최소 live smoke 는 `draft`/`improve`/`ask` 이며, `ingest`/`curate` 는 각 슬라이스에서 provider runtime 을 재사용한다.
- provider 자동 라우팅/비용 최적화. 사용자 명시 설정이 우선이며 자동 라우팅은 v1.5+.

#### DoD

| 항목 | 게이트 |
|---|---|
| 3종 key preflight | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY` 중 하나라도 없으면 agent-server 가 actionable error 를 반환 |
| pydantic-ai runtime | `/draft`, `/improve`, `/ask` 가 Python pydantic-ai 워커를 호출하고 기존 schema 로 검증된 `Patch` 또는 `ReadOnlyAnswer` 만 반환 |
| 테스트 모드 격리 | 결정적/TestModel 출력은 명시적 test runtime flag 없이는 실행되지 않음 |
| Live `/draft` smoke | Gemini 기본 모델로 생성된 patch preview → approval queue 승인 → 2-phase write → 디스크 `.md` 확인 |
| Observability | `agent_runs` 와 trace/span 에 provider/model/status 가 남고, 사용 가능한 token/cost 메타데이터가 기록됨 |
| Regression | 기존 deterministic 계약 테스트는 TestModel 기반으로 유지하되 정상 runtime 으로 오인되지 않음 |

#### 새 세션 시작 지침

S-08.6 구현 세션은 다음 명령으로 시작한다.

```powershell
powershell -ExecutionPolicy Bypass -File tools/agent-harness.ps1 -Command validate
powershell -ExecutionPolicy Bypass -File tools/agent-harness.ps1 -Command brief -Slice S-08.6
```

## 13.8 S-12a · Solo 세션 정체성 + dev act-as 토글 / Solo identity & dev impersonation deep dive

> **이 절은 S-12a 슬라이스의 *상세 명세* 다.** 원래 S-12 (RBAC + 멀티유저) 한 덩어리는 (a) 단일 사용자 Solo 모드의 세션 정체성 인프라 + 개발용 임퍼소네이션 토글 (S-12a) 과 (b) Team/Enterprise SSO·SCIM·멤버 UI (S-12b) 로 분할된다 (§14.2). S-12a 의 목적은 **로그인 UI 없이도 RLS 가 제대로 발화하도록 만들고, 개발자가 역할별 분기 UI 를 로그인 없이 검증할 수 있게 만드는 것**.

### 13.8.1 배경 / Why split

S-09b 의 수동 페이지 관리·승인 큐, S-10 의 read agents 권한, S-11 의 분석 모드 토글 등은 모두 권한별 분기를 가진다. 그런데 S-12 원안은 SSO·SCIM·멤버 UI 까지 한 덩어리라 M3 까지 미뤄져, 그 사이 슬라이스들이 *권한 분기를 손으로 검증할 방법이 없는* 상태였다. 동시에 P-IND 페르소나의 Solo 모드는 §11.2 에 이미 *RBAC 비활성, single user* 로 정의되어 있어, **인증 흐름 없이도 v1 가치가 성립**한다. 이 둘을 갈라 Solo 인프라를 먼저 닫고 Team/Enterprise 는 M3 그대로 둔다.

### 13.8.2 범위 / Scope

#### IN scope

1. **Solo 모드 디폴트** — 새 workspace 를 열면 Solo 모드. UI 에 로그인 화면이 없다. §11.2 의 Solo 행이 디폴트.
2. **로컬 사용자 정체성 provisioning** — workspace 첫 오픈 시 `.weki/user.json` 에 `{ user_id: <UUID>, display_name: <OS user name> }` 1회 생성. 이후 같은 workspace 의 모든 세션이 이 UUID 를 사용. 유저가 직접 편집해 표시명만 바꿀 수 있음.
3. **`agent-server` 미들웨어** — 모든 HTTP/SSE 요청 시작 시 `SET LOCAL app.user_id = $solo_user_id` 를 실행. 기존 RLS 정책(§11.3.1)은 그대로 발화. Solo 사용자는 자신이 속한 단일 `memberships` 행을 가지며 role='editor' 로 부트스트랩 (자기 patch 자동승인 §11.4.1).
4. **Dev-only act-as 토글** — 개발자가 다른 역할을 임퍼소네이션:
   - 환경변수: `WEKI_DEV_AS_ROLE=reader|editor|admin|owner` (백엔드 미들웨어가 인지)
   - Tauri dev 메뉴 dropdown: 렌더러에서 변경하면 IPC 로 백엔드에 전달, 다음 요청부터 적용
   - Solo 사용자의 `memberships.role` 을 *세션 단위로* 임시 오버라이드 (DB 행 자체는 변경 안 함 — `SET LOCAL app.role_override = '<role>'` + RLS 헬퍼 함수가 우선순위 처리)
5. **Production hard-gate** — 프로덕션 빌드에서 act-as 경로는 dead-code:
   - 백엔드: `process.env.NODE_ENV === 'production'` 일 때 `WEKI_DEV_AS_ROLE` 무시 + 시작 시 경고 로그
   - 렌더러: `import.meta.env.DEV` 가드 안에 dev 메뉴 노출
   - Tauri Rust: dev profile (`tauri dev`) 에서만 메뉴 등록, release profile 은 `#[cfg(not(debug_assertions))]` 로 strip
   - 빌드-타임 검증 테스트 1건: production 번들에 `WEKI_DEV_AS_ROLE` 문자열이 *없는지* grep
6. **Audit 정합** — `audit_log.actor_user_id` 는 *임퍼소네이션된* user_id 가 아니라 *실제 Solo 사용자 UUID* 를 기록하되, `metadata.acted_as_role` 에 임퍼소네이션 역할을 별도 기록. 실수로 임퍼소네이션 상태에서 만든 변경을 추적 가능.

#### OUT of scope (S-12b 로)

- 로그인 UI, OAuth/SAML/OIDC.
- 멤버 초대·역할 변경·제거 UI.
- SCIM provisioning, IP allowlist, 세션 정책, audit export.
- Team/Enterprise 모드 토글 UI (단, 데이터 모델은 §11.2 그대로 유지 — Solo 의 single membership 이 Team 의 첫 owner 로 자연스럽게 승격될 수 있어야 함).
- 다른 사람 patch 적용 권한 분기 (Solo 에는 다른 사람이 없음 — 이 분기 코드는 존재하되 UI 노출은 S-12b).

### 13.8.3 사용자/개발자 흐름 / Flows

**일반 사용자 (P-IND, Solo)**:
1. 데스크톱 앱 시작 → "Open Workspace" → 빈 폴더 선택.
2. `.weki/user.json` 자동 생성, `agent-server` 가 해당 UUID 를 세션에 set.
3. 모든 슬래시 명령은 자기 자신을 editor 로 인식. `/draft` 의 patch 는 §11.4.1 디폴트 정책에 따라 자동 승인. `/curate` 의 IA op 는 자동 승인 *안 함* (D11 — 강화만 가능, 비활성 불가).

**개발자 (역할별 UI 검증)**:
1. `WEKI_DEV_AS_ROLE=reader pnpm --filter @weki/desktop dev` 또는 dev 메뉴에서 `Reader` 선택.
2. 슬래시 메뉴에서 `/draft` 시도 → reader 는 write agents 권한 없음 → 거부 + audit_log `write_denied` 행 (C1 검증).
3. dev 메뉴에서 `Admin` 으로 전환 → 같은 workspace 에서 `/import` 가능, IA op 적용 가능.
4. dev 메뉴에서 `Solo (자기)` 로 복귀 → 일반 사용자 흐름으로 복귀.

### 13.8.4 DoD / Definition of Done

| 항목 | 게이트 |
|---|---|
| Solo 디폴트 | 새 workspace 첫 오픈 시 로그인 화면 0회 노출, `.weki/user.json` 1회 생성 |
| 세션 정체성 미들웨어 | `agent-server` 통합 테스트: 모든 라우트가 `app.user_id` 를 set 하지 않으면 RLS 가 0 행 반환 (회귀 가드) |
| RLS 정합 | 기존 [packages/db/src/rls.integration.test.ts](packages/db/src/rls.integration.test.ts) 의 `setActorContext` 패턴이 미들웨어 통과한 실제 세션에서도 동일 결과 |
| §11.4.1 Solo 정책 | Solo 사용자의 `/draft` patch 는 자동 승인, `/curate` IA op 는 항상 큐 (1만 호출 fuzz, A14) |
| Act-as 토글 | dev 모드에서 4개 역할 모두 임퍼소네이션 가능, 미들웨어가 우선순위 정확 적용 |
| Production strip | release 빌드 번들 + Rust release binary 에서 act-as 관련 식별자(`WEKI_DEV_AS_ROLE`, dev 메뉴 라벨) 0건 grep |
| Audit 정합 | 임퍼소네이션 중 발생한 모든 audit_log 행은 `actor_user_id=<Solo UUID>` + `metadata.acted_as_role=<role>` 동시 기록 |
| Solo→Team 호환 | 추후 S-12b 에서 Solo membership 을 첫 owner 로 승격하는 마이그레이션 dry-run 통과 (스키마 변경 없음, role 만 갱신) |

#### 명시적 OUT of DoD

- 로그인 UI (S-12b).
- 다중 사용자 시나리오 통합 테스트 (S-12b 의 C1).
- Solo→Team 모드 전환 *UI* (S-12b).

### 13.8.5 위험과 완화 / Risks

| 위험 | 영향 | 완화 |
|---|---|---|
| Act-as 가 프로덕션에 새어나감 | 권한 우회 가능 | 빌드-타임 grep 가드 + Rust `#[cfg(not(debug_assertions))]` 이중 strip + CI 의 release 빌드 산출물 검사 |
| Solo 사용자가 admin/owner 권한 필요 액션을 시도 | UX 차단 | Solo 모드의 single membership 을 *editor* 로 두되, owner-전용 액션(예: workspace 삭제) 은 Solo 모드에서 자기 자신에게 자동 owner 권한 부여(코드 분기). S-12b 에서 진짜 owner 와 정합 |
| `.weki/user.json` 손상/이동 | 다른 UUID 로 복귀 시 audit 끊김 | 손상 감지 시 새 UUID 생성 + `audit_log` 에 `identity_rebuilt` 행 1회 + 이전 UUID 기록 |
| 개발자가 act-as 상태로 실데이터 변경 | 본인이 한 변경인 줄 착각 | UI 상단 노란 배너 "ACTING AS: admin (dev only)" 상시 표시 + audit_log 의 metadata 가 사실 추적 가능 |
| RLS 가드 회귀 | 한 라우트가 `app.user_id` 안 set | 통합 테스트: `app.user_id` unset 시 어떤 도메인 테이블도 0 행 반환되도록 RLS 정책 보강 (이미 §11.3.1 의 `current_user_org_ids()` 가 unset 시 `NULL` 반환 → `ANY (NULL)` 으로 0 행 — 검증만 추가) |

### 13.8.6 후속 슬라이스에 미치는 영향 / Downstream impact

S-12a 머지 후:

- **S-09b (Curate)** — 수동 페이지 관리 + IA op 승인 큐를 제대로 된 user_id 위에서 검증. `audit_log.actor_user_id` 가 진짜 UUID.
- **S-10/S-11** — read agents·LSP 진단의 권한 분기 UI 를 dev 메뉴로 손쉽게 검증.
- **S-12b (Team/Enterprise)** — Solo 의 single membership 을 첫 owner 로 승격, OAuth/SAML 후 `app.user_id` 를 JWT.sub 로 교체하는 swap-in 만 남음. 데이터 모델 변경 0.
- **S-13 (Web)** — 데스크톱의 Solo 정체성을 그대로 web 의 cookie 세션으로 미러링하지 않음 — web 은 S-12b 이후에 진입하는 것을 가정.

