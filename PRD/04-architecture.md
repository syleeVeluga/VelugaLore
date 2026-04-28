---
section: 4
title: "시스템 아키텍처 / System Architecture"
parent: VelugaLore PRD
status: Draft (implementation-ready)
last_updated: 2026-04-26
---

# 4. 시스템 아키텍처 / System Architecture

## 4.1 큰 그림 / High-level diagram

```
┌──────────────────────────── Desktop Shell (Tauri) ───────────────────────────┐
│  ┌──────────────────────────  Renderer (TypeScript/React)  ────────────────┐ │
│  │  Editor (CodeMirror 6 + ProseMirror bridge)  │  Graph view (sigma.js)  │ │
│  │  Command palette (slash menu)                │  Side panels             │ │
│  └────────────────────────────────┬─────────────────────────────────────────┘ │
│                              IPC (Tauri commands + events, JSON-RPC)           │
│  ┌────────────────────────────── Core (Rust)  ────────────────────────────┐  │
│  │ Workspace FS watcher · Patch applier · Auth · Crypto · Plugin host · LSP   │  │
│  └────────────────────────────────┬───────────────────────────────────────┘  │
│                                   │ Unix domain socket / TCP loopback         │
│  ┌──────────── Agent Daemon (TypeScript, opencode-pattern reference) ──┐   │
│  │ HTTP+SSE server · Session/run mgr · Tool runtime · MCP host          │   │
│  │ AGENTS.md loader · Mode resolver (analyze/edit) · Slash router       │   │
│  └────────────────────────────────┬───────────────────────────────────────┘   │
│                                   │ stdin/stdout JSON-RPC                       │
│  ┌──────────── Agent Workers (Python, pydantic-ai) ────────────────────┐     │
│  │  Core: DraftAgent · ImproveAgent · AskAgent · IngestAgent · CurateAgent │ │
│  │  System: ImportAgent · FindAgent · DiffAgent · BlameAgent · LintAgent   │ │
│  │  + 1st-party 확장 (T2/T3, §10.2)                                       │ │
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
| Shell | Tauri 2.x (Rust core, WebView2/WKWebKit) | Next.js 15 + React 19 |
| Workspace FS | OS 파일시스템 직접 마운트 | OPFS + IndexedDB 캐시 |
| Postgres | local Postgres 또는 self-hosted | self-hosted/cloud only (브라우저는 SQL 직접 연결 안 함) |
| Agent daemon | 같은 머신 자식 프로세스 | 서버측 워커 풀 (Kubernetes job) |
| LSP | 데스크톱만 (markdown LSP, vale, ltex) | 미지원 |
| 오프라인 | 완전 오프라인 가능(local LLM 옵션) | 부분 오프라인 (PWA 캐시) |
| 핫키 | 글로벌 단축키, 트레이 | 브라우저 단축키 |

원칙: **두 환경의 데이터·API 표면은 동일**(같은 OpenAPI). UI 만 본질적으로 갈라진다.

## 4.3 opencode 의 위치 — 레퍼런스이지 의존성이 아님 / opencode as a design reference, not a dependency

> **결정**: opencode 는 **설계 레퍼런스** 로 다룬다 — 코드 벤더링은 *옵션* 이며 v1 GA 의 critical path 에 없다. 우리는 opencode 가 코딩 도메인에서 검증한 **패턴** 을 이해하고 같은 가치(탐색·정밀 편집·변경 추적·세션·확장)를 workspace 에서 자체 구현으로 재현한다.

이렇게 정한 이유:

- **라이선스/업스트림 추적 부담 회피** — 코드 의존을 핵심 경로에 두면 출시 일정이 업스트림 일정에 묶인다. 옵션 차용(§4.3.2)을 시도하더라도 critical path 에는 두지 않는다.
- **도메인 차이** — 코드 도구(Bash, code interpreter)는 문서 워크스페이스에서 위협 표면일 뿐. workspace 환경에 맞는 도구만 들이는 편이 깨끗하다.
- **자체 구현이 작다** — 클라이언트-서버 분리, 슬래시 라우팅, 도구 화이트리스트, plan/build 모드 같은 패턴은 각각 수십~수백 줄. pydantic-ai 위에서 자체 구현하는 게 보수 비용이 더 낮다.

### 4.3.1 패턴 차용 매트릭스 / Pattern adoption matrix

각 행은 [opencode 가 어떻게 했는지] · [우리가 빌리는 가치] · [우리가 어떻게 할 것인지] 3-tuple.

#### A. 클라이언트-서버 분리

- **opencode 의 구현** — `packages/sdk-server` 가 HTTP + SSE 로 세션을 호스트, `packages/tui` 가 한 클라이언트. 다른 클라이언트(`sdks/vscode`, 데스크톱 앱) 가 같은 서버에 붙는다. *"the TUI frontend is just one of the possible clients."*
- **우리가 흡수하는 가치** — 데스크톱·브라우저·CLI·VS Code 확장이 **같은 데몬** 에 붙어 같은 workspace 를 본다. UI 만 다르고 동작은 동일.
- **우리 구현** — TypeScript 데몬 `packages/agent-server` 자체. Hono(HTTP) + native SSE. 세션 ID 는 `agent_runs.id`. *opencode 코드 의존 0.*

#### B. 슬래시 라우팅 (`/<verb> [args]`)

- **opencode 의 구현** — `packages/cli` 의 라우터가 verb 매칭 → 해당 agent 모듈에 전달. `@general` 같은 sub-agent 호출도 같은 라우터.
- **우리가 흡수하는 가치** — 에디터 본문에서 `/` 로 자연스럽게 부르는 표면. 자동완성 + 인라인 인자.
- **우리 구현** — `packages/core/src/slash/parse.ts` (§6.3 컨트랙트). 순수 함수 + zod 검증. 자동완성은 CodeMirror 6 hint 확장. *opencode 코드 의존 0.*

#### C. AGENTS.md 컨벤션 (사람이 쓰는 강제 행동 규칙)

- **opencode 의 구현** — 레포 루트의 `AGENTS.md` 에 *코드 컨벤션* 을 자연어로 기술 ("ALWAYS USE PARALLEL TOOLS", "Prefer automation: execute without confirmation unless blocked by safety/irreversibility", 네이밍 규칙 등). 모든 에이전트가 작업 전 자동 로드.
- **우리가 흡수하는 가치** — 형식 같음. 단 도메인이 다르다 — *코드 컨벤션* → *조직 문서 규칙* (용어집·톤·금칙어·기본 모드·승인 정책). 회사마다 다른 규칙을 한 곳에.
- **우리 구현** — `workspace/.weki/AGENTS.md` 위치 고정. 모든 코어/확장 에이전트가 시스템 프롬프트 앞에 prepend 로 자동 포함. 형식과 예시는 §10.2 에 명세.

#### D. plan ↔ build 모드 토글 (Tab)

- **opencode 의 구현** — Tab 키로 두 모드 전환. **plan** = read-only(파일 수정 거부, bash 명령은 사용자 확인), **build** = full access. 우리 PRD 는 `git diff` 검토용 plan 모드를 자주 언급.
- **우리가 흡수하는 가치** — 비-테크 사용자에게도 "지금 변경 가능한 모드인가" 가 시각적으로 명확.
- **우리 구현** — §7.6. 명칭은 **분석(Analyze) ↔ 편집(Edit)**. 신규 workspace 기본은 `analyze`. 분석 모드에서 쓰기 명령 회색 처리.

#### E. 도구 화이트리스트 (per-agent capability)

- **opencode 의 구현** — agent 정의가 사용 가능한 도구 목록을 명시. plan agent 는 Edit/Write/Bash 비활성, build 는 다.
- **우리가 흡수하는 가치** — 에이전트마다 다른 책임 → 다른 도구. `curate` 는 `split_doc/merge_docs/move_doc` 만, `improve` 는 `replace_range` 만.
- **우리 구현** — pydantic-ai `@agent.tool` 데코레이터 + agents.toml 의 `tools = [...]` 화이트리스트. 데몬이 호출 시점에 강제 검증, 위반 시 `ToolNotAllowedError`.

#### F. 도구 셋: 검색·탐색·정밀 편집·비교 (방대한 workspace 의 핵심 능력)

opencode 의 진짜 강점은 *수만 파일에서도 정확한 위치를 ms 단위로 찾고, 정확한 라인 단위로 변경한다* 는 것. 이걸 workspace(수만 노드의 사규·매뉴얼·메모) 로 옮기는 게 우리 검색·탐색·비교 시스템의 핵심.

##### F-1. Read 류 (단일 노드 읽기)

- **opencode 의 구현** — `Read` 도구가 offset/limit/page 인자로 큰 파일을 청크로 읽음. binary/이미지/PDF 도 처리.
- **우리 구현** — `read_doc`(`doc_id` 또는 path → body+frontmatter), `read_doc_versions`(rev range), `read_raw`(원본 binary). 큰 노드는 자동 청크 + offset 지원.

##### F-2. Glob (파일 패턴 매칭)

- **opencode 의 구현** — `Glob` 도구가 표준 glob 문법(`src/**/*.ts`) 으로 파일을 찾고 *수정 시간 내림차순* 정렬. 작업 컨텍스트의 핵심 — "최근 변경된 관련 파일을 우선" 패턴.
- **우리 구현** — `glob_workspace`. 두 축으로 확장:
  1. **path glob** — `wiki/policies/**/*.md`
  2. **frontmatter JSONPath** — `frontmatter.@? '$.kind == "policy" && $.confidence > 0.7'` (Postgres jsonb_path_query)
  결과 정렬 옵션: `recent`(updated_at desc), `linked`(백링크 수), `relevance`(검색 시).

##### F-3. Grep · Search (방대한 본문에서 위치 찾기 — *두 도구로 분리*)

opencode 의 `Grep` 한 도구가 두 시나리오를 동시에 커버한다 — *정확한 regex* (코드 일치) 와 *느슨한 일치* (코드 의도 검색). 우리 도메인에선 둘이 백엔드도 다르고 사용자도 다르므로 **두 개의 별도 도구** 로 분리한다.

```
glob_workspace   → 경로 (path) 패턴
grep_workspace   → 내용 (text) 정규식         ← opencode Grep 직역
search_workspace → 의미 (semantic) 랭킹 검색  ← 우리만의 보강
```

###### F-3a. `grep_workspace` — 정확한 regex 검색 (opencode Grep 1:1)

- **opencode 의 구현** — ripgrep 백엔드. PCRE 정규식 + multiline + context lines + file type filter + output mode 3종(`content`/`files_with_matches`/`count`) + head_limit + offset. 수만 파일에서 ms 단위.
- **언제 쓰는가** — *embedding 이 못 찾는* 정확한 매칭. 예:
  - 깨진 wiki link 패턴: `\[\[[^\]]*\]\]` 중 매칭 후 dst_doc 부재
  - frontmatter 안 특정 키: `^kind:\s*policy$`
  - 특정 인용 표기: `\(저자 \d{4}\)` 미사용 표기 발견
  - 회사 표준 위반 표현: `\b(갑|을)\b` (AGENTS.md 금칙어 검증)
- **우리 구현** — 데스크톱은 workspace 의 raw markdown 파일에 ripgrep 직접 호출(가장 빠름). 브라우저는 Postgres `body ~ pattern` (regex) + `pg_trgm` 으로 후보 좁힘.
- **인터페이스** (opencode Grep 거의 그대로):

  ```ts
  grep_workspace({
    pattern: string,                    // PCRE
    path?: string | string[],           // glob, 기본 workspace 전체
    kind?: DocumentKind[],              // 메타 필터 (frontmatter)
    tag?: string[],
    output_mode?: 'content' | 'files_with_matches' | 'count',  // default 'files_with_matches'
    context?: number,                   // -A=B=C
    before?: number,                    // -B
    after?: number,                     // -A
    case_insensitive?: boolean,         // -i
    multiline?: boolean,                // -U
    invert_match?: boolean,             // -v
    whole_word?: boolean,               // -w
    body_only?: boolean,                // default true (frontmatter 제외)
    head_limit?: number,                // default 100
    offset?: number,                    // default 0
  }) → GrepResult
  ```

  결과 형식 (output_mode 별):

  ```ts
  // 'content'
  { hits: [{ doc_id, path, line, col, match, before: string[], after: string[] }] }

  // 'files_with_matches'  (default — opencode 와 동일)
  { paths: [{ doc_id, path, match_count }] }   // path 사전순 정렬

  // 'count'
  { total_matches: number, total_files: number, by_path: [{ path, count }] }
  ```

###### F-3b. `search_workspace` — 의미 랭킹 검색 (우리만의 보강)

- **언제 쓰는가** — 자연어 쿼리 (예: "근속연수 정의", "휴가 사용 절차"). 동의어·오타·재표현 허용 필요.
- **백엔드 — 3-way + RRF**:

  | 축 | Postgres 백엔드 | 강점 | 약점 |
  |---|---|---|---|
  | **literal** (정확 단어/구) | `body_tsv` GIN (tsvector, BM25-유사) | 정확 용어 | 동의어 못 잡음 |
  | **fuzzy** (오타·부분일치) | `body` pg_trgm GIN | 오타 허용 | 의미 못 잡음 |
  | **semantic** (의미) | `embedding` ivfflat → HNSW (pgvector 0.8+) | 의미 동등 표현 | 정확 단어 약함 |

  **결과 합성 — Reciprocal Rank Fusion**: 세 축의 순위를 `1/(k+rank)` 로 합쳐 단일 점수.

  필터: `kind` · `tag` · `path` glob · `since`/`until` · `author` · `frontmatter` JSONPath. 모두 GIN 인덱스에 매칭.

  결과 형식: `{doc_id, path, title, snippet(±100자, 매칭 하이라이트), score, score_breakdown:{literal,fuzzy,semantic}}`. 사이드 패널 ranked list, 클릭 시 점프.

###### F-3c. 둘을 언제 어떻게 쓰는가 / Decision rule

| 의도 | 도구 | 이유 |
|---|---|---|
| 깨진 `[[link]]` 패턴 | `grep_workspace` | embedding 은 패턴 못 잡음 |
| AGENTS.md 금칙어 위반 | `grep_workspace` | regex 가 정확 |
| "근속연수 어디 정의됐지?" | `search_workspace` | 자연어 + 동의어 |
| frontmatter `kind=policy` 인 파일 | `glob_workspace` (frontmatter JSONPath) | 메타필터 |
| 정확한 인용 표기 누락 | `grep_workspace` | 패턴 매칭 |
| "사규 개정안과 충돌하는 다른 정책" | `search_workspace` 후 `compare_docs` (F-6) | 의미 + 비교 |

에이전트 시스템 프롬프트(특히 `find` / `review` / `lint`) 가 이 결정 규칙을 명시적으로 알고 자기 시나리오에 맞춰 두 도구를 골라 호출.

##### F-4. Edit / Write (정밀 변경)

- **opencode 의 구현** — `Edit` 은 *exact string match* 기반. `old_string` 이 unique 해야 성공, 아니면 `replace_all`. `Write` 는 새 파일/완전 덮어쓰기.
- **우리 구현** — PatchOp `replace_range`(인덱스 기반, `body_sha256` 으로 sanity check) + `create_doc`. 인덱스 기반이 string match 보다 안전 — 사용자가 동시에 편집해도 충돌 검출.

##### F-5. MultiEdit (한 파일에 여러 sequential edit)

- **opencode 의 구현** — `MultiEdit` 이 한 파일에 여러 `Edit` 을 트랜잭션으로 적용. 한 op 라도 실패하면 전체 롤백.
- **우리 구현** — `refactor` 에이전트가 **여러 노드** 에 걸쳐 같은 동작. 한 `agent_runs` 에 모든 PatchOp 가 묶여 통째로 revert. (opencode 가 *한 파일 안* 트랜잭션이라면 우리는 *workspace 전체* 트랜잭션으로 한 단계 더 나아감.)

##### F-6. Compare / Duplicates / Cluster (방대한 문서 비교 — opencode 에 없는 능력)

- **opencode 에는 없다** — 코딩에서는 `git diff`, `Task` (subagent) 로 우회. 대신 우리 workspace 에선 **사규 vs 사규**, **회의록 100개 중 같은 토픽**, **임포트한 100노드 중 거의 같은 것** 같은 비교가 1차 시나리오.
- **우리 구현 — 신설 도구 3종** (§10.4 에 등록):

  | 도구 | 입력 | 출력 | 백엔드 |
  |---|---|---|---|
  | `compare_docs(a, b, mode?)` | 두 doc_id + mode∈{prose,set,structure} | `{similarity:0..1, common:[paragraphs], diff:[a_only, b_only], aligned:[(a_para, b_para, score)]}` | embedding cosine + tsvector overlap + 헤딩 트리 LCS |
  | `find_duplicates(scope, threshold?)` | scope(workspace/dir/dirty) + threshold(0.85 default) | 클러스터 후보 그룹들 — 각 그룹 = `{docs:[doc_ids], avg_similarity, suggested_action: 'merge'|'keep_both'}` | embedding kNN + 후처리(BM25 검증) |
  | `cluster_docs(scope, k?)` | scope + 옵션 k | `{clusters: [{centroid_embedding, members, suggested_label}]}` | embedding HDBSCAN(자동 k) 또는 k-means(고정 k) |

  세 도구 모두 `curate` 에이전트의 *판단 근거* 로도 사용된다. 예: `find_duplicates` → `merge_docs` Patch 제안.

##### F-7. 코드 도구 제거 / What we explicitly drop

- **`Bash`** — 임의 셸 실행. 위협 표면이 너무 큼.
- **`WebFetch`** — 외부 도구 카테고리로만 (`approval` 필수, §11.4).
- **언어별 LSP code action** (rename, refactor symbol 등) — 코드 도메인 전용. 우리 LSP 는 마크다운 진단 전용.

#### G. 세션·런 관리자 (멀티턴 컨텍스트 누적)

- **opencode 의 구현** — 세션 ID 단위로 메시지/도구 호출/상태가 영속. CLI 종료 후 다시 들어와도 컨텍스트 유지.
- **우리가 흡수하는 가치** — "사규 v2.3 개정" 같은 한 작업이 며칠에 걸친 수십 명령을 묶음.
- **우리 구현** — Postgres `agent_runs.parent_run_id` 로 트리(부모 세션 → 자식 호출). UI 는 사이드 패널의 "세션 타임라인" 으로 노출.

#### H. MCP 호스트

- **opencode 의 구현** — MCP 표준 채택. 외부 도구를 데몬이 호스트.
- **우리가 흡수하는 가치** — HRIS/ERP/Confluence/Slack/사내DB 를 도구로 1:1 노출.
- **우리 구현** — `@modelcontextprotocol/sdk-typescript` 를 직접 사용 (opencode 코드 의존 0). `workspace/.weki/mcp.toml` 에 등록.

#### I. `@<subagent>` 메타 호출 (예: `@general`)

- **opencode 의 구현** — 메인 에이전트가 `@general` 을 호출해 복잡한 검색/멀티스텝 작업을 위임.
- **우리가 흡수하는 가치** — 코어가 직접 못 하는 일은 sub-agent 로 위임. `compile` 이 야간 잡으로 다른 에이전트(ingest, curate)를 호출하는 패턴.
- **우리 구현** — `agent_runs.parent_run_id` + `compile` 오케스트레이터(pydantic-ai `Agent[CompileDeps, CompilePlan]`). 사용자가 직접 호출은 하지 않고, 시스템이 트리거.

#### J. LSP 통합

- **opencode 의 구현** — out-of-the-box LSP 클라이언트 호스트. 에이전트가 진단/액션을 요청해서 응답을 자기 컨텍스트에 합류.
- **우리가 흡수하는 가치** — 마크다운에서도 IDE 같은 빨간 밑줄 (깨진 wiki link, 고아 노드, 용어 불일치, 인용 누락).
- **우리 구현** — `packages/markdown-lsp` 자체 구현. `vscode-languageserver-node` 직접 사용. opencode LSP 통합부는 *참고용 코드* 로만 본다.

### 4.3.2 옵션: 코드 차용 가능 지점 / Optional vendoring touchpoints

코드를 직접 가져오는 것이 *명확한* 시간 절약일 때만 한정 차용. 옵션 차용분은 모두 `vendor/` 격리.

| 후보 모듈 (opencode 측) | 차용 검토 시점 | 차용하면 얻는 것 | 빠지면 어떻게? | 판정 |
|---|---|---|---|---|
| `packages/sdk-server` (HTTP+SSE 골격) | M1 직전 | 검증된 세션 모델, 에러 처리 | Hono + native SSE 자체 — 며칠 | **자체 구현 우선** |
| `packages/cli` 슬래시 자동완성 UI | M1 | TUI 측 이미 검증된 hint UX | CodeMirror 6 `autocompletion` 확장 | **자체 구현 우선** |
| 도구 런타임 골격 (Read/Grep/Glob 인터페이스) | M2 | 도구 인터페이스 정합성 | 직접 정의 (zod 스키마 + 단위테스트) | **자체 구현 — 도메인 다름** |
| MCP 호스트 어댑터 | M2 | 검증된 MCP 라이프사이클 | `@modelcontextprotocol/sdk-typescript` 직접 | **자체 구현 — SDK 가 있음** |
| LSP 통합 어댑터 | M2 | LSP 클라이언트 추상화 | `vscode-languageserver-node` 직접 | **자체 구현 — SDK 가 있음** |
| `sdks/vscode` 패키지 (참고만) | v1.5 | VS Code 에서 workspace 열기 사례 | 자체 vsix 작성 | **참고만, 차용 X** |

**판정 규칙**: *"자체 구현 1주 < 차용 + rebase 평생 비용"* 이면 자체 구현. 위 표의 모든 후보가 이 규칙을 적용하면 자체 구현이 이긴다 — opencode 의 검증된 *패턴* 만 빌리고 코드는 안 빌리는 게 v1 기본.

### 4.3.3 자동화 정책의 *반대* 방향 / Automation policy: ours is the inverse

opencode 의 AGENTS.md 는 *"Prefer automation: execute requested actions without confirmation unless blocked by missing info or safety/irreversibility."* 를 명시 — **자동 실행 디폴트, 확인은 예외.** 코드 작업의 효율을 위해 합리적이다.

VelugaLore 는 **반대 방향**을 채택한다 (D11, §17.3):

> **코어 4가지 디폴트 / Four defaults**
>
> 1. Patch 출력은 항상 **preview 후 사용자 확인**(approval queue, §11.4) 통과해야 적용.
> 2. 신규 workspace 의 모드 디폴트는 **Analyze**(§7.6) — 쓰기 명령은 회색 비활성.
> 3. `curate` 같은 구조 변경 op 는 **자동 적용 절대 금지** (D9·D10).
> 4. 외부 도구(`web_fetch`, MCP) 는 **호출 전 사용자 확인**.

이유: 우리 사용자는 비-테크 다수, 데이터는 회사 자산(사규·정책), 실수 비용이 코드보다 크다. *옵시디언 사용자에게 "묻지 말고 실행" 은 위험* — 비전 자체가 "사람이 보고 동의하는 형태로 에이전트가 제안" (§3.0)이다.

이 차이는 우리 도메인이 다르다는 것을 가장 잘 드러내는 한 줄이며, AGENTS.md 에 자동화 정책 행이 있다면 *우리는 거꾸로 둔다*.

### 4.3.4 변경 추적 / Change tracking

workspace 는 git 으로 미러된다(옵션, default ON). git 은 **두 번째 진실 근원** 으로 쓰지 않고, **export·diff·blame UI 의 백엔드** 로만 쓴다 — 진실 근원은 Postgres (D1, §17.3).

- 모든 patch 적용은 자동 git commit. 메시지 표준: `agent:<id> run:<run_id> · <summary>` 또는 `human:<email> · <summary>`.
- "이 import_run rollback" → 프로그램이 inverse patch → 새 commit (revert).
- 깃 푸시는 사용자 토큰 BYO. VelugaLore 는 자체 호스팅 git 운영 안 함.

### 4.3.5 비-목표 / Non-goals

- 코드 실행 도구(Bash, code interpreter) 노출 금지.
- workspace 외 파일 시스템 임의 접근 차단 — 모든 read 도구는 workspace 루트로 chroot.
- opencode 의 모델 라우팅(Zen) 사용 안 함 — provider 추상화는 pydantic-ai.

## 4.4 pydantic-ai 활용 전략 / Reusing pydantic-ai

- 모든 전담 에이전트는 `pydantic_ai.Agent[Deps, Output]` 으로 구현.
- `Output` 은 항상 Pydantic `BaseModel` (i.e. 항상 검증된 구조화 출력 → patch 의 입력으로 쓸 수 있다).
- `RunContext` 의 `deps` 에 workspace, postgres pool, audit logger 주입.
- `@agent.tool` 로 등록되는 도구는 §10 "에이전트 도구 카탈로그" 의 화이트리스트 안에서만.
- `pydantic_graph` 로 컴파일 파이프라인의 다단계 의존성 표현 (예: ingest → crosslink → reindex).
- Human-in-the-loop tool approval 은 patch 적용 게이트에 매핑 (§11.4).

### 4.4.1 LLM provider — v1 GA 동봉 3종 / Three providers shipped in v1

> **결정 (D13, §17.3)** — v1 GA 는 **OpenAI · Anthropic · Google Gemini** 3개를 1급 provider 로 동봉한다. VelugaLore 의 핵심 가치는 AI agent 가 문서 워크플로우를 실제로 수행하는 데 있으므로, 정상 agent runtime 은 `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY` 3종 preflight 를 모두 통과해야 한다. pydantic-ai 의 model-agnostic 추상화 위에서 기본은 Gemini 를 쓰고, workspace·에이전트별 오버라이드를 허용한다. 다른 provider(Mistral/Cohere/local Ollama 등)는 v1.5+ 옵션.

#### 동봉 provider 와 권장 모델

| Provider | v1 역할 | 비용 1순위 | 품질 1순위 | pydantic-ai ID 형식 |
|---|---|---|---|---|
| **Google Gemini** | **기본 LLM** | `gemini-2.5-flash-lite` | `gemini-3-pro-preview` 또는 최신 pro preview/stable | `google-gla:<model>` |
| **OpenAI** | 1급 provider + embedding 기본 | `gpt-4o-mini` 또는 `gpt-5-mini` (provider 최신) | `gpt-5` 류 (provider 최상위) | `openai:<model>` |
| **Anthropic** | 1급 provider + 고품질 agent override | `claude-haiku-4-5` | `claude-sonnet-4-6` 또는 `claude-opus-4-6` | `anthropic:<model>` |

> **모델 ID 명시 정책** — 모델 라인업은 자주 변하므로 PRD 는 *카테고리*(가성비 / 품질 / default)와 현재 권장값만 고정한다. 2026-04-28 기준 Gemini 기본값은 `gemini-2.5-flash-lite` 이다. provider 가 모델을 deprecate 하면 README CHANGELOG 와 `workspace/.weki/config.toml` 기본값을 갱신한다.

#### Runtime key policy

정상 desktop/agent-server runtime 은 다음 3종 key 가 모두 있어야 시작한다.

```powershell
$env:OPENAI_API_KEY = "..."
$env:ANTHROPIC_API_KEY = "..."
$env:GOOGLE_API_KEY = "..."
```

키 누락은 제품 기능 축소가 아니라 설정 오류다. 데스크톱은 workspace open 또는 agent-server spawn 단계에서 누락 provider 를 명확히 보여주고, agent-server 는 core agent 실행 전에 `PROVIDER_KEY_MISSING` 계열 오류를 반환한다. 결정적 출력은 `WEKI_AGENT_RUNTIME=test` 같은 명시적 테스트 모드에서만 허용하며, 정상 runtime 의 자동 fallback 으로 쓰지 않는다.

#### 에이전트별 권장 모델 매핑 / Default model per agent

대부분 에이전트는 사용자가 workspace 디폴트를 쓰면 충분하지만, *에이전트별 오버라이드* 도 가능 (`agents.toml` 의 `model` 키, 또는 `workspace/.weki/config.toml` 의 `[agent.<id>]` 블록).

| 에이전트 | v1 권장 카테고리 | 이유 |
|---|---|---|
| `draft` | mini/flash 류 (가성비) | 초안은 자주 호출, 사용자가 다듬음 |
| `improve` | mini/flash 류 | 옵션 3개 생성, 호출 빈도 높음 |
| `ask` | sonnet/pro/gpt-large 류 | 답변 품질·근거 추적 중요 (compounding 후반부) |
| `ingest` | mini/flash 류 + (큰 raw 시) sonnet/pro | fan-out 결정과 요약 정확도. raw > N MB 시 자동 승격 |
| `curate` | sonnet/pro/gpt-large 류 | IA 결정·근거 생성, 위험 도구라 품질 1순위 |
| 시스템 작업(`find`/`grep`/`compare`/...) | n/a (대부분 LLM 미사용) | regex/tsvector/embedding 으로 직접 처리 |
| 1st-party 확장 | 각 에이전트 자체 권장 | marketplace manifest 의 `recommended_model` 메타 |

#### 사용자 workspace 의 기본 설정 형식

```toml
# workspace/.weki/config.toml

[providers.required]
openai = true
anthropic = true
google = true

[llm.default]
provider = "google-gla"
model = "gemini-2.5-flash-lite"

[llm.fallback]
provider = "openai"
model = "gpt-4o-mini"

# 에이전트별 오버라이드
[agent.curate]
provider = "anthropic"
model = "claude-opus-4-6"          # 가장 무거운 일은 가장 큰 모델

[agent.draft]
provider = "google-gla"
model = "gemini-2.5-flash-lite"
```

#### Provider 추상화 — pydantic-ai 활용

```python
# packages/agent-runtime-py/src/agent.py
from pydantic_ai import Agent

def make_agent(agent_id: str, workspace_config: WorkspaceConfig) -> Agent:
    cfg = workspace_config.resolve_model(agent_id)   # 에이전트 → provider/model 결정
    return Agent(
        f"{cfg.provider}:{cfg.model}",            # e.g., "google-gla:gemini-2.5-flash-lite"
        deps_type=AgentDeps,
        output_type=PatchOrAnswer,
        instructions=load_prompt(agent_id),       # AGENTS.md + skills + agents/<id>.md
    )
```

workspace 가 provider 를 바꾸려면 `config.toml` 의 한 줄만 수정. 코드/PRD 변경 0줄.

#### 비-목표 / Non-goals (provider 측면)

- 자체 모델 학습/파인튜닝 — 외부 provider 또는 self-hosted endpoint 에 위임 (§1.3).
- *모델 자동 라우팅* (예: 비용/품질 자동 선택) — 사용자에게 *명시적 선택권* 을 둔다. 자동 라우팅은 v1.5+.
- opencode 의 Zen 모델 라우팅 사용 안 함 (§4.3.5 비-목표).

### 4.4.2 Embedding provider — OpenAI 우선 / OpenAI embedding first

> **결정 (D13)** — v1 GA embedding 디폴트는 **OpenAI `text-embedding-3-*` 시리즈**. 한·영 multilingual 품질 + 차원 축소 옵션(Matryoshka) + 안정적 SLA. 다른 옵션(Voyage/Cohere/로컬 bge-m3)은 v1.5+ 토글.

| 옵션 | 차원 | 비용/1M 토큰 (참고) | 품질 (MTEB-Ko 평균 참고치) | 인덱스 (1M docs, ivfflat) | v1 권장 |
|---|---|---|---|---|---|
| **`text-embedding-3-small`** | 1536 (또는 truncated) | 가장 저렴 | ≈ 70 | ≈ 6 GB | **v1 default** — 비용/품질 균형 |
| `text-embedding-3-large` | 3072 (또는 1024/256 truncated) | 중간 | ≈ 73~75 | ≈ 12 GB (3072) / ≈ 4 GB (1024) | **품질 1순위** 시 (large→1024d truncated 추천) |
| (옵션) Voyage / Cohere | 1024 | 다양 | ≈ 71~73 | ≈ 4 GB | v1.5 토글 |
| (옵션) 로컬 `bge-m3` | 1024 | 0 (CPU/GPU 비용) | ≈ 72 | ≈ 4 GB | data sovereignty 가 필수일 때 v1.5+ |

> *수치는 모두 참고치 — provider 의 가격·차원·품질은 자주 변한다. v1 launch 시점에 README 의 deps pin 으로 정확한 모델 ID 를 명시.*

#### 디폴트 결정 — `text-embedding-3-small` (1536d)

- **비용**: large 보다 5배 저렴. ingest fan-out (한 raw → 3~10 노드) 마다 호출하므로 ingest 비용을 5배 절감.
- **품질**: small 의 한국어 점수가 우리 사용성에는 충분 (`/find` top-3 hit ≥ 90% 게이트 A17 통과 가능 범위).
- **차원**: 1536d 는 §8.5.2 표 기준 1024d 의 1.5배. 1M 노드까지는 무난.
- **차원 축소** — `text-embedding-3` 시리즈는 `dimensions` 파라미터로 1536→1024 또는 256 까지 truncate 가능 (Matryoshka). 인덱스 크기 우려 시 1024d 옵션 활성.

#### 마이그레이션 경로

workspace 가 자라거나 품질이 더 필요하면 §8.5.4 절차로 `text-embedding-3-large` 1024d (truncated) 또는 다른 모델로 전환 가능. dual-write → CONCURRENTLY HNSW → cutover.

#### `workspace/.weki/config.toml` 의 embedding 블록

```toml
[embedding]
provider = "openai"
model = "text-embedding-3-small"
dimensions = 1536          # 또는 1024 (truncated, 인덱스 크기 ↓)
batch_size = 100           # ingest 시 청크 단위
```

#### Embedding 도구는 `embed` 한 줄로 추상화 (§10.4)

에이전트는 `embed(text)` 만 부르고, 그 결과 vector 의 차원/모델은 신경 쓰지 않는다 — `vector(N)` 컬럼은 workspace 단위로 일관. 다른 workspace 가 다른 차원을 쓸 수 있다 (RLS 와 함께 workspace_id 로 격리).
