---
section: 7
title: "UI/UX (옵시디언 유사) / Obsidian-like UI"
parent: WekiDocs PRD
status: Draft (implementation-ready)
last_updated: 2026-04-26
---

# 7. UI/UX (옵시디언 유사) / Obsidian-like UI

## 7.1 레이아웃 원칙 / Layout principles

- **3-pane** 기본: 좌측 파일트리/태그·검색, 가운데 에디터(탭+분할), 우측 백링크/그래프 미니맵/에이전트 패널.
- **명령 팔레트** (`Cmd/Ctrl+K`) 와 **슬래시 메뉴** (`/` in editor) 는 다르게 동작:
  - 명령 팔레트 = 앱 명령(파일 열기, 설정 등) + 에이전트 메타 명령.
  - 슬래시 메뉴 = 본문에 인라인으로 실행되는 에이전트 명령.
- **그래프뷰**: v1 은 force-directed 2D (sigma.js), 노드=문서, 엣지=`[[wiki link]]`. v2 에서 RDF/Triple 그래프(주어·술어·목적어) 를 옵션으로.
- **Daily note** 와 **inbox** 는 양 축. inbox 는 "raw"의 진입로, daily note 는 사용자 사고의 진입로.

### 7.1.1 전체 화면 목업 / Full-window mockup (Edit 모드)

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ Acme Co. Workspace                                              ◯ Analyze  ●Edit  Tab→  ⌘⇧A │  ← 타이틀바 + 모드 칩
├──────────┬───────────────────────────────────────────────┬───────────────────────────────┤
│ Files    │ wiki/policies/근태.md   ✎ rev 17  human       │  Backlinks  ▾                │
│ ─────    │ ─────────────────────────────────────────────  │  ─────────                    │
│ ▾ wiki   │ # 근태 관리 규정                               │  ← wiki/qa/근태-휴가.md      │
│  ▾ pol.  │                                                │  ← wiki/policies/_index.md   │
│   인사   │ ## 1. 근속연수 정의                             │                              │
│   근태 ●│  근속연수는 입사일부터 퇴직일까지의 ┃           │  Outline  ▾                  │
│   복리   │  만 연수로 정의한다 [[정의-연도]].   ┃           │  ─────────                    │
│  ▾ src   │                                       ┃ slash   │  1. 근속연수 정의             │
│ ▸ raw    │ ## 2. 휴가 제도                       ┃ menu    │  2. 휴가 제도                │
│ ▸ inbox  │  /imp│                                ┃         │  3. 출퇴근 기록              │
│ Tags     │ ▔▔▔▔▔│                                ┃         │                              │
│ #policy  │ /improve  --tone executive            ┃         │  Agent panel  ▾              │
│ #근태    │ /improve  --maxWords 80               ┃         │  ─────────                    │
│          │ /import   path:./사규-2026.zip ...    ┃         │  Last run: /improve          │
│ Search   │                                       ┃         │  ⟲ Re-run     ⌘⇧R           │
│ ⌘⇧F     │                                                │                              │
│ /find    │                                                │  Mini graph                  │
│ /grep    │                                                │  · ●  ┐                      │
└──────────┴───────────────────────────────────────────────┴───────────────────────────────┘
   파일트리·검색·태그       에디터(탭+슬래시 메뉴+ProseMirror 위젯)        백링크·아웃라인·에이전트
```

색 약속: 모드 칩의 `●Edit` 은 **노란 배경**, 분석 모드는 회색. 편집 모드에서 사용자는 "지금 변경 가능" 을 색만으로 인식. (§7.6)

### 7.1.2 수동 페이지·폴더 관리 기본 / Manual page & folder management baseline

WekiDocs 는 `/curate` 가 자동으로 정보 아키텍처를 제안하는 제품이지만, 사용자가 평범하게 Notion/Obsidian 처럼 직접 문서를 만들고 정리할 수 있어야 한다. 이 수동 관리 레이어는 S-09b 의 일부로 검증한다. 이유는 사람이 직접 바꾼 페이지/폴더 구조와 `curate` 가 제안하는 IA op 가 같은 백링크·stub·revert 불변식을 공유해야 하기 때문이다.

좌측 파일트리는 v1 에서 다음 조작을 기본 제공한다.

| 조작 | 진입점 | 보장 |
|---|---|---|
| 새 페이지 | `Cmd/Ctrl+N`, 파일트리 우클릭, 명령 팔레트 `New page` | 선택한 폴더 아래 `.md` 생성, 즉시 제목 편집, `documents.kind` 기본값은 `draft` |
| 새 폴더 | 파일트리 우클릭 `New folder` | 빈 폴더는 `folder/_index.md` (`kind='index'`) 로 표현해 DB/FS 동기화와 검색 대상이 유지됨 |
| 이름 변경 | 파일트리 inline rename, 현재 문서 제목 영역 | `documents.path` 와 title 동시 갱신, `[[wiki link]]` rewrite preview 제공 |
| 이동 | drag/drop, `Move to...` 명령 | `move_doc(relink=true)` 와 같은 백링크 보존 규칙 사용. 사람이 직접 이동하면 별도 approval 없이 즉시 적용하되 undo 가능 |
| 복제 | 파일트리 `Duplicate` | 새 `doc_id`, 새 path, 원본 링크는 복사하되 `frontmatter._import` 는 제거 |
| 삭제/보관 | `Delete` 또는 파일트리 메뉴 | 기본은 `wiki/_archive/` 로 이동. 영구 삭제는 confirm dialog + 외부 링크 0 확인 후만 |
| 복원 | archive 파일트리 또는 `/diff`/`/revert` 패널 | `doc_versions` 에서 원래 path/body 복원 |
| 태그·kind 편집 | frontmatter 패널 또는 문서 상단 속성 행 | `documents.frontmatter`, `document_tags`, `documents.kind` 동기화 |

수동 조작은 에이전트 출력이 아니므로 `Patch` 생성 의무는 없지만, 적용 경로는 반드시 §11.1 의 2-phase write 를 사용한다. 모든 구조 조작은 `doc_versions` 와 `audit_log` 에 남고, undo/redo 와 `/revert` 의 대상이 된다. 분석 모드에서는 본문 편집과 구조 조작 버튼을 비활성화하고, 파일 열기·검색·graph/backlink 탐색만 허용한다.

## 7.2 메뉴 구조 / Top-level menus

```
File   : New / Open workspace / Open in window / Recent / Export (md, pdf, docx, pptx) / Quit
Edit   : Undo (workspace scope), Redo, Find/Replace, Find in workspace
View   : Toggle left/right pane, Graph view, Backlinks, Outline, Reading mode
Workspace  : Compile (incremental) / Compile (full) / Lint / Health check / Backup
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
| Workspace 전체 검색 (`/find`) | `⌘⇧F` | `Ctrl+Shift+F` |
| Workspace 변경 이력 (`/diff` 패널) | `⌘⇧H` | `Ctrl+Shift+H` |

## 7.4 에디터 / Editor

- 베이스: **CodeMirror 6** (가벼운 마크다운 + LSP). 표/임베드를 위해 ProseMirror 위젯을 일부 영역에서 호출.
- 마크다운 확장: `[[wiki link]]`, `![[embed]]`, `#tag`, frontmatter YAML, Mermaid, footnote, callout.
- **에이전트 패치 미리보기**: diff 인라인(추가=초록 하이라이트, 삭제=취소선), 우측 패널에서 옵션 비교, 단축키 `1/2/3` 으로 옵션 선택, `A` 로 적용, `R` 로 거절.
- **보이스 입력 X (v1)**, **수식 X (v1)** — 명시적 비-목표.

### 7.4.1 Slash menu 자동완성 목업 / Slash menu mockup

사용자가 본문에서 `/` 입력 → 인라인 메뉴. verb 자동완성 → tab 후 인자 자동완성.

```
사용자 입력: /imp│
┌──────────────────────────────────────────────────────────────────┐
│ /improve     선택 영역에 톤·길이 개선 (3 옵션)         core    ▸ │ ← 매칭 1순위
│   /improve --tone executive                                    │
│   /improve --tone casual                                       │
│   /improve --maxWords 120                                      │
│   /improve --tone legal       (Legal Tone Skill 활성)          │
│ ─────                                                          │
│ /import      기존 문서 폴더/zip 1:1 이관               system  ▸│
│ /imports     (활성된 sub-command 없음)                          │
└──────────────────────────────────────────────────────────────────┘
        ↑↓: 이동   Tab: 선택 후 인자 자동완성   Enter: 실행   Esc: 취소

사용자가 Tab 으로 /improve 선택, --t Tab → --tone:
┌──────────────────────────────────────────────────────────────────┐
│ /improve --tone │                                                │
│   executive     공식 톤 (외부 보고용)                            │
│   casual        일상 톤                                          │
│   formal        격식 톤                                          │
│   legal         법률 톤 (Legal Tone Skill 활성)  ← skill 매칭   │
└──────────────────────────────────────────────────────────────────┘
```

**소스 라벨** 우측 — `core` (코어 5개) / `system` (workspace 운영) / `ext` (1st-party 확장) / `workspace` (사용자 정의 T1/T2) / `plugin` (T3). 충돌 시 §10.5 우선순위로 표시.

### 7.4.2 Diff preview 목업 / Diff preview mockup

`/improve` 같은 3-옵션 명령이 patch 를 제안하면, 본문 인라인에 diff + 우측 패널에 옵션 비교.

```
본문 (인라인 diff, Edit 모드):
┌──────────────────────────────────────────────────────────────────┐
│ ## 1. 근속연수 정의                                              │
│                                                                  │
│  근속연수는 ─입사일부터 퇴직일까지의─ ▍입사일~퇴직일 사이의      │ ← 옵션 1 (선택됨, 노란 배경)
│  ─만 연수로 정의한다─ ▍만 연수로 한다 [[정의-연도]].             │
│                                                                  │
│  ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔  │
│                                                                  │
│  취소선 = 삭제, 노란 배경 = 추가, 초록 = 합쳐진 부분            │
└──────────────────────────────────────────────────────────────────┘

우측 패널 (옵션 비교):
┌──────────────────────────────────────┐
│ /improve  · 3 alternatives           │
│ ────────────────                     │
│ ① conservative   FK 7.2  17 단어  ●│  ← 선택됨
│   "입사일~퇴직일 사이의 만 연수…"   │
│                                      │
│ ② tonal          FK 6.8  19 단어    │
│   "근속연수란 입사일에서 퇴직일까지…" │
│                                      │
│ ③ concise        FK 6.1  12 단어    │
│   "입사일부터 퇴직일까지 만 연수."   │
│                                      │
│ ────────────────                     │
│ rationale (each):                    │
│ ① 의미 보존 우선                     │
│ ② 톤 강조                            │
│ ③ 간결성 강조 (의미 일부 모호)       │
│                                      │
│ ─────                                │
│ [1][2][3]  옵션 토글                 │
│ [A] Apply   [R] Reject               │
│ [E] Edit option   [P] Send to queue  │
└──────────────────────────────────────┘
```

키보드:
- `1`/`2`/`3` 옵션 토글 (인라인이 즉시 갱신)
- `A` Apply (즉시 적용 또는 approval queue 로 전송 — RBAC 에 따라)
- `R` Reject (rationale 입력 옵션)
- `E` 옵션 텍스트 직접 편집 (사용자 변형)
- `P` Approval queue 로 전송 (다른 사람 승인 필요 시)

### 7.4.3 Curate preview 목업 / Curate preview (트리 변경)

`/curate` 같은 IA 변경은 본문 diff 대신 **트리 비교** 로 표시. 분석 모드에선 *제안만 보고 적용 안 함* (§7.6, §13.6).

```
┌─────────────────────────────────────────────────────────────────────────┐
│ /curate scope:wiki/policies                  ▶ proposing 5 changes      │
│ run #c4f1   created 2026-04-26 14:02           rationale ▾  approve ▾   │
│ ────────────────────────────────────────────────────────────────────────│
│                                                                         │
│  Before (현재)                          After (제안)                    │
│  ────────                              ────────                         │
│  wiki/policies/                         wiki/policies/                  │
│   ├─ 근태.md                            ├─ _index.md       ✚ 신규       │
│   ├─ 휴가.md                            ├─ 인사/                        │
│   ├─ 비밀유지.md                        │   ├─ _index.md   ✚ 신규       │
│   ├─ 채용.md                            │   ├─ 채용.md     → 이동       │
│   ├─ 보안-규정.md                       │   ├─ 인사평가.md  → 이동       │
│   ├─ 인사평가.md                        │   └─ ...                      │
│   ├─ ... (32개)                         ├─ 근태/                        │
│                                         │   ├─ _index.md   ✚ 신규       │
│                                         │   ├─ 근태.md     → 이동       │
│                                         │   └─ 휴가.md     → 이동       │
│                                         └─ 보안/                        │
│                                             ├─ _index.md   ✚ 신규       │
│                                             ├─ 비밀유지.md  → 이동       │
│                                             └─ 보안-규정.md → 이동       │
│                                                                         │
│ Proposed ops (5):                                                       │
│ ① create_doc(kind=index, path=wiki/policies/_index.md)                 │
│    rationale: "32개 페이지 + 인덱스 부재 (AGENTS.md §3 위반)"          │
│ ② create_doc(kind=index, path=wiki/policies/인사/_index.md) + 4 sub.   │
│    rationale: "cluster_docs(scope) 결과 5개 자연 클러스터 (silh 0.62)" │
│ ③ move_doc × 12                                                         │
│ ④ insert_link × 32                                                      │
│ ⑤ update_index(wiki/_index.md)                                          │
│                                                                         │
│ Risks (auto-checked):                                                   │
│  ✓ 외부 링크 0건 (F6 통과)                                              │
│  ✓ 백링크 보존 100% (F7 grep 검증)                                      │
│  ✓ doc_versions 모든 변경 전 rev 보존 (A12)                             │
│                                                                         │
│ ─────                                                                   │
│ [A] Approve & apply    [R] Reject all                                   │
│ [P] Send to approval queue (admin 승인 필요)                            │
│ [E] Edit per-op (개별 op 토글)                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

분석 모드에서는 `[A]`/`[P]` 버튼이 회색 비활성, `[R]` 와 trees 만 보임.

## 7.5 그래프뷰 / Graph view

- v1: force-directed, 필터(태그/타입/시간), 노드 크기 = 백링크 수, 색상 = `documents.kind`.
- v2: JSON Triple 그래프 모드 추가. 술어(`predicate`) 별로 엣지 색상/스타일 분리.
- 성능 목표: 5,000 노드까지 60fps, 50,000 노드까지 30fps (WebGL).

## 7.6 분석 모드 ↔ 편집 모드 토글 / Analyze ↔ Edit mode (opencode plan/build 차용)

opencode 의 `plan/build` 토글을 비-테크 사용자 친화 명칭(**분석 / 편집**) 으로 노출. 우측 상단 모드 칩 + `Tab` 단축키.

- **분석 모드 (Analyze, default for new workspace)** — 모든 슬래시 명령은 `read-only` 카테고리만 활성. `/find`, `/grep`, `/diff`, `/blame`, `/review`, `/lint`, `/ask`, `/compare`, `/duplicates`, `/cluster` 만 보인다. 어떤 patch 도 적용되지 않음. `curate`/`refactor` 같은 쓰기 명령은 *제안만 생성하고* `[A]/[P]` 버튼이 회색 비활성.
- **편집 모드 (Edit)** — 전체 명령 카탈로그 활성. 모든 patch 는 여전히 §11.4 approval queue 통과 후 적용.
- **승인 정책** — `workspace/.weki/AGENTS.md` 의 `default_mode: analyze|edit` 로 workspace 별 기본값 지정. 신규 사용자 workspace 는 `analyze` 가 기본 (실수 보호).
- **가시성** — 모드 칩이 항상 화면에 보임. 편집 모드에서는 부드러운 색 톤(노란 배경) 으로 사용자가 "지금 변경이 가능한 모드" 임을 인식.

### 7.6.1 모드 칩 시각 / Mode chip visuals

```
분석 모드:                      편집 모드:
┌───────────────┐               ┌───────────────┐
│ ●Analyze  ◯Edit│               │ ◯Analyze ●Edit │
│ 회색 배경      │               │ 노란 배경      │
│ Tab→ 전환     │               │ Tab→ 전환     │
└───────────────┘               └───────────────┘
```

상태바 좌측에 작은 보조 표시 — `Mode: Analyze (read-only)` 또는 `Mode: Edit · approval queue active`.

## 7.7 Approval Queue / Approval queue (Cmd+Shift+A)

모든 patch (코어/시스템/확장 모두) 는 *적용 전* 이 큐를 거친다. RBAC (§11.3) 에 따라 자동 통과 / 검토 필요 분기.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Approval Queue                            ⌘⇧A 닫기   ▾ filters         │
│ ─────────────────────────────────────────────────────────────────────── │
│  pending 4   approved today 17   rejected today 2   superseded 1        │
│ ─────────────────────────────────────────────────────────────────────── │
│                                                                         │
│  pending                                                                │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ ● /curate run #c4f1     5 ops   wiki/policies   ⏱ 2분 전          │ │
│  │   by: AI agent (curate v1.0.0)        rationale: "32개 + 인덱스 부재" │
│  │   risks: ✓ ext-links ✓ backlinks ✓ versions                       │ │
│  │   needs: admin approval (RBAC, §11.3)                             │ │
│  │   ─────                                                           │ │
│  │   [A] Approve   [R] Reject   [V] View diff   [E] Edit ops         │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ ● /improve run #b813    3 alternatives   wiki/policies/근태.md    │ │
│  │   by: jane@acme.com → AI agent (improve)                          │ │
│  │   needs: editor 자기 승인                                          │ │
│  │   ─────                                                           │ │
│  │   [A] [R] [V]                                                     │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ ⚠ /web_fetch (legal-citation-verifier plugin)                     │ │
│  │   target: https://www.law.go.kr/...                               │ │
│  │   needs: admin approval (외부 도구, §11.4)                         │ │
│  │   [A] [R]                                                         │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  approved today (17)  ▾   rejected today (2)  ▾   superseded (1)  ▾    │
└─────────────────────────────────────────────────────────────────────────┘
```

- **자동 통과 vs 검토** — RBAC 정책(§11.3) 에 따라:
  - editor 가 자기 패치 승인: 자동 통과
  - admin 권한 필요: 큐에 머무름 (admin 알림)
  - 외부 도구(`web_fetch`, MCP) 호출: 항상 admin 승인
- **알림** — pending 큐가 새 항목으로 변할 때 트레이 알림(데스크톱) 또는 푸시(웹).
- **감사 로그** — 모든 [A]/[R] 결정은 `audit_log` 에 actor·시간·이유 기록 (S3, A14).

## 7.8 명령 팔레트 / Command palette (Cmd+K)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ⌘K  ─────────────────────────────────────────────────────────────────  │
│ │ approval│                                                          │ │
│ ─────────────────────────────────────────────────────────────────────── │
│  Open Approval Queue                                       ⌘⇧A         │
│  Open AGENTS.md (workspace rules)                                          │
│  Manage agents (agents.toml)                                           │
│  Toggle Analyze/Edit mode                                  Tab         │
│  Run last agent command                                    ⌘⇧R         │
│  Open Workspace settings                                                   │
│  Open Plugin marketplace                                               │
│  Reload plugins                                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

명령 팔레트 = *앱/메타* 명령. 슬래시 메뉴 = 본문 *작업* 명령. 둘은 다르다 (§7.1).
