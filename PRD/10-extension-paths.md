---
section: 10
title: "IPC, 확장 경로 / IPC and Extension Paths"
parent: VelugaLore PRD
status: Draft (implementation-ready)
last_updated: 2026-04-26
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
| **T1 · Skill** | `SKILL.md` + 옵션 스크립트 | `workspace/.weki/skills/<id>/` | 마크다운 한 장 | 코어 에이전트의 호출 패턴(예: `draft` 시 자동 첨부 컨텍스트) | 비-테크 사용자, 운영팀 |
| **T2 · 마크다운 정의 에이전트** | `<id>.md` (시스템 프롬프트) + `agents.toml` 한 줄 | `workspace/.weki/agents/` | 코드 0줄 | 신규 슬래시 명령 + 코어 도구 화이트리스트 안의 도구만 | 도메인 전문가, 조직 운영자 |
| **T3 · 플러그인** | `.weki-plugin` 번들 (manifest + JS bundle + 선택적 Python worker) | 사용자 설치 | TypeScript/Python | 신규 도구·UI 패널·매크로 | 개발자, 3rd-party 벤더 |
| **T4 · MCP 서버** | `mcp.toml` 등록, 외부 프로세스/HTTP | `workspace/.weki/mcp.toml` | 임의 언어 | 사내 시스템(HRIS/ERP/CRM/Slack/Confluence 등)을 도구로 노출 | IT/플랫폼팀 |

### 10.2.0 workspace/.weki/AGENTS.md (workspace 전체에 적용되는 강제 규칙) / AGENTS.md (workspace-wide rules)

opencode 의 `AGENTS.md` 컨벤션을 **형식만** 차용한다(도메인이 다르므로 내용은 우리 도메인에 맞게). workspace 루트의 `workspace/.weki/AGENTS.md` 가 모든 코어/확장 에이전트의 시스템 프롬프트 앞에 자동 prepend 된다 — 즉 **회사/팀의 문서 작성 규칙 한 곳**.

```markdown
# AGENTS.md  ─ Acme Co. VelugaLore workspace 규칙

## 0. 기본 모드
default_mode: analyze        # 분석/편집 (§7.6). 신규 작업은 항상 analyze 로 열림.

## 1. 글쓰기 톤
- 공식 문서는 '~합니다' 체. 메모/회의록은 '~한다' 체.
- 수동태 피하고 능동태로. 한 문장 30 단어 이하.
- 금칙어: '갑/을' (대신 '발주처/수주처'), '인사 담당자' (대신 'HR 담당자')

## 2. 용어집 (curate 가 우선 참조)
- '직원' = '구성원' (모든 wiki 페이지에서 통일)
- '결재' = '승인'
- '연차휴가' = '연차'

## 3. 위키 구조 규칙 (curate)
- wiki/policies/ 의 페이지가 30 개를 넘으면 카테고리 분할 제안
- 인덱스 페이지(`_index.md`) 는 모든 카테고리 폴더의 루트에 둔다
- 페이지 평균 길이 > 4000 단어면 split 제안

## 4. 승인 정책 (approval queue, §11.4)
- /curate 의 split_doc/merge_docs/move_doc 은 모두 admin 1명 이상 승인.
- /refactor 는 editor 2명 이상 승인.
- /web_fetch, MCP 외부 도구는 항상 호출 전 approval.

## 5. 인용 규칙 (cite 활성 시)
- 외부 인용은 footnote 로, 출처 URL 과 접속 일자 포함.
- 내부 위키 인용은 `[[wiki link]]` 만 사용.
```

이 형식은 의도적으로 **자연어 + 약간의 frontmatter** 다 (코드 컨벤션 강제 규칙처럼). 에이전트가 로드 시 파싱해 *컨텍스트로 사용*. 우리는 opencode 처럼 코드 작업 컨벤션이 아니라 **조직 문서 규칙**을 둔다는 점만 다르다.

### 10.2.1 T1 · Skill (가장 가벼움) / Tier 1 — Skill

```
workspace/.weki/skills/legal-tone/
├── SKILL.md          # 사용 시점·트리거·예시·금칙어
├── examples/         # few-shot 예시 (옵션)
└── glossary.md       # 도메인 용어집 (옵션)
```

`SKILL.md` 예시:

```markdown
---
id: legal-tone
trigger:
  - agent: improve
    when: "doc.kind in ['policy','contract'] OR doc.path startswith 'wiki/legal/'"
  - agent: draft
    when: "user_intent contains '계약서'"
priority: high      # 다른 skill 과 충돌 시 우선
---

# Legal Tone Skill

이 skill 은 법률 문서 톤 가이드를 코어 에이전트에 주입한다.

## 강제 규칙
1. 단정적 의무 표현은 '~한다' 또는 '~하여야 한다' 만 사용 ('~할 수 있다'는 권리)
2. 한 조항 = 한 문장 (가능하면)
3. 정의된 용어는 본문에서 처음 사용 시 따옴표 + 정의 ("'당사자'란 ...")

## 예시
[examples/clause-1.md] 는 좋은 예
[examples/avoid-1.md] 는 피할 예

## 금칙어
- '~의 경우' → '~인 때' 또는 '~할 때'
- '~함에 있어서' → '~할 때' 또는 삭제
```

`SKILL.md` 의 frontmatter 가 트리거를 정의(언제 자동 합류할지)하고, 본문은 사람이 읽는 자연어 지침. 코어 에이전트(`draft`/`improve`/`ask`/`ingest`/`curate`) 가 호출 시점에 매칭되는 skill 들을 자동 prepend. **비-테크 사용자가 하루 안에 회사 톤을 학습시키는 통로**.

#### Skill vs AGENTS.md 의 차이

- **AGENTS.md** = workspace 전체에 *항상* 적용되는 강제 규칙 (1개 파일)
- **Skill** = *특정 조건* 일 때만 자동 합류 (N개 파일, frontmatter 의 trigger 로 활성)

즉 AGENTS.md 는 헌법, Skill 은 조례. 서로 충돌하면 AGENTS.md 가 우선.

### 10.2.2 T2 · 마크다운 정의 에이전트 / Markdown-defined agent

코드 0줄로 신규 슬래시 명령을 추가하는 경로. 1st-party 확장 에이전트(§5.3)도 사실 이 형식의 더 정교한 버전이다 — 즉 사용자가 그 1st-party 에이전트를 자기 workspace 에서 *복제·수정* 해 자기 변형을 만들 수 있다.

#### 파일 배치

```
workspace/.weki/
├── AGENTS.md                          # workspace 전체 규칙 (§10.2.0)
├── agents.toml                         # 에이전트 등록부
├── agents/
│   ├── contract-checklist.md          # 시스템 프롬프트 + 출력 스펙
│   ├── policy-impact-analyzer.md
│   └── legal-citation-verifier.md
└── skills/
    └── ...
```

#### `agents.toml` 등록부 (회사 전체)

```toml
# workspace/.weki/agents.toml

# ── 1st-party 확장의 활성화 (체크박스만 켜면 끝) ──────────────
[[agent]]
id = "plan"
enabled = true                  # marketplace 에서 받아온 1st-party
                                # 코드/프롬프트는 plugin 측

[[agent]]
id = "simplify"
enabled = true

# ── 사용자 정의 마크다운 에이전트 (T2) ─────────────────────────
[[agent]]
id = "contract-checklist"
slash = "/contract"             # 슬래시 호출명 (충돌 시 workspace 가 이긴다, §10.3)
prompt = "agents/contract-checklist.md"   # 상대 경로
tools = [                       # 도구 화이트리스트 (코어 도구만 가능)
  "read_doc",
  "search_workspace",
  "lint_terms",
  "read_glossary",
]
output = "Patch"                # "Patch" | "ReadOnlyAnswer"
mode = "edit"                   # "analyze" 면 read 도구만 호출 가능
requires_approval = ["external_lookup"]   # 자동 적용 금지 도구
description = "계약서 표준 항목 확인"
help_example = "/contract --section 보증조항"
skills = ["legal-tone"]         # 자동 합류시킬 skill 들

[[agent]]
id = "policy-impact-analyzer"
slash = "/policy-impact"
prompt = "agents/policy-impact-analyzer.md"
tools = ["read_doc", "search_workspace", "list_links_to"]
output = "ReadOnlyAnswer"        # 보고만 함, patch 안 만듦
mode = "analyze"
description = "정책 변경이 영향주는 다른 페이지 추적"
```

#### `agents/contract-checklist.md` 예시 (시스템 프롬프트 + 출력 스펙)

```markdown
---
id: contract-checklist
version: 1.0.0
output_schema: ChecklistAnswer       # pydantic_ai 의 BaseModel 이름
---

# Contract Checklist Agent

## 역할
주어진 계약서 문서에서 표준 조항(11항목)의 존재·완성도를 점검한다.

## 11개 표준 조항
1. 당사자 정의
2. 계약 목적
3. 계약 기간
4. 대금 지급
5. 비밀유지
6. 지식재산권 귀속
7. 손해배상
8. 분쟁해결 (관할/준거법)
9. 계약 해지
10. 효력 발생일
11. 서명란

## 출력 (ChecklistAnswer)
다음 구조의 ReadOnlyAnswer 만 반환:
- `findings`: list[ChecklistItem]
- 각 ChecklistItem 은 { item: str, status: "ok"|"missing"|"weak", evidence: str|None, suggestion: str|None }

## 행동 규칙
- 본문을 절대 수정하지 않는다 (mode=analyze).
- 의심스러운 표현은 'weak' 로 표시하고 사용자에게 판단 위임.
- AGENTS.md 의 용어집(§10.2.0) 을 무시하지 않는다.
```

#### 동작 흐름 — 사용자가 `/contract` 입력 시

1. 슬래시 라우터가 `agents.toml` 에서 `id="contract-checklist"` 검색
2. 데몬이 시스템 프롬프트 = `AGENTS.md` + 매칭되는 skills + `agents/contract-checklist.md` 합쳐 빌드
3. pydantic-ai 가 `Agent[ContractDeps, ChecklistAnswer]` 로 호출
4. 도구 호출 시 화이트리스트 외 도구는 `ToolNotAllowedError` 반환
5. 결과가 `output_schema` 와 맞지 않으면 자동 retry (pydantic 검증)
6. `ReadOnlyAnswer` 면 사이드 패널에 표시, `Patch` 면 §11.4 approval queue

**전부 코드 0줄. 마크다운 + TOML 만으로 신규 슬래시 명령이 작동한다.**

### 10.2.3 T3 · 플러그인 / Plugin

- 분포 단위: `.weki-plugin` (zip; manifest + JS bundle + 선택적 Python 워커 스펙).
- 매니페스트:

```toml
# plugin.toml
id = "com.example.tone-coach"
name = "Tone Coach"
version = "0.3.1"
api = ">=0.1 <0.2"
permissions = ["read_doc", "search_workspace"]
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

- Agent daemon 은 MCP host. 사용자가 `workspace/.weki/mcp.toml` 로 등록.
- 에이전트는 자기 capability 화이트리스트 안에서만 MCP 도구 호출 (§11.4 approval).
- 흐름: agent → daemon → MCP server → tool result → daemon → agent.
- 표준 차용 — opencode 코드 의존 없음.

```toml
# workspace/.weki/mcp.toml
[[server]]
id = "internal-hris"
transport = "stdio"
command = "/usr/local/bin/hris-mcp"
permissions = ["read_employee_directory"]
requires_approval = ["search_employee_pii"]
```

## 10.3 확장 SDK 의 약속 / Extension SDK promises

- **Stable surface** — Patch op 종류와 도구 화이트리스트는 SemVer. minor 변경은 호환, major 만 깨짐.
- **Doc-first** — 새 op 는 PRD 부록에 추가된 뒤에만 SDK 노출.
- **Same eval framework** — 1st-party·3rd-party 같은 골든셋 형식(§12).

## 10.4 사용 가능한 도구 화이트리스트 / Available tools (T1~T2 가 호출 가능)

T1(Skill) 과 T2(마크다운 정의 에이전트) 는 *코드 도구를 정의할 수 없고* 다음 카탈로그에서만 골라 쓴다. T3(플러그인) 만 새 도구를 코드로 정의 가능.

| 분류 | 도구 ID | 입력 → 출력 | 권한 |
|---|---|---|---|
| 읽기 | `read_doc` | `doc_id` → `{title, body, frontmatter}` | read |
| 읽기 | `read_glossary` | (workspace 의 용어집 페이지) → entries[] | read |
| 읽기 | `read_style_guide` | (AGENTS.md 의 §1 글쓰기 톤 추출) → text | read |
| 읽기 | `read_doc_versions` | `doc_id, range?` → versions[] | read |
| 읽기 | `read_agent_runs` | `run_id` → run + children | read |
| 읽기 | `read_index` | (`kind='index'` 페이지들) → index entries | read |
| 읽기 | `read_raw` | `raw_source_id` → bytes/text + mime | read (raw) |
| 읽기 | `read_sources` | `doc_id` → 인용 소스 메타데이터 | read |
| 검색 | `grep_workspace` | regex + filters + output_mode + context lines → `{paths|hits|count}` (opencode Grep 직역, ripgrep 백엔드) | read |
| 검색 | `search_workspace` | query + filters → ranked hits[] (literal+fuzzy+semantic 3-way, RRF 합성) | read |
| 검색 | `glob_workspace` | path glob + (옵션) frontmatter JSONPath + sort → paths[] | read |
| 검색 | `list_links_to` | `doc_id, hops?` → 백링크 doc_id[] | read |
| 검색 | `read_neighbors` | `doc_id, hops?, kind?` → n-hop 그래프 이웃 | read |
| 검색 | `embed` | text → vector(1024) | read |
| **비교** | `compare_docs` | `(a, b, mode∈{prose,set,structure})` → `{similarity, common, diff:{a_only,b_only}, aligned}` | read |
| **비교** | `find_duplicates` | `scope, threshold=0.85` → groups[] (각: docs[], avg_similarity, suggested_action) | read |
| **비교** | `cluster_docs` | `scope, k?` → clusters[] (centroid, members, suggested_label) | read |
| **비교** | `rank_fusion` | `[ranking_a, ranking_b, ...] → merged ranking` (RRF, T2 가 직접 호출 가능한 빌딩 블록) | read |
| 검증 | `lint_terms` | text → 위반 목록 (AGENTS.md 의 용어집 기준) | read |
| 검증 | `verify_facts` | claim → confidence + evidence (외부 호출 가능, approval) | external |
| 외부 | `web_fetch` | url → text | external (approval 필수) |
| 외부 | `ocr` | image → text | external (approval 필수) |
| 파싱 | `parse_docx` / `parse_md` / `parse_html` / `parse_notion_export` / `parse_confluence_export` | bytes → AST | read |
| 파싱 | `extract_attachments` | bundle → files[] | read |
| 변환 | `remap_links` | text + old↔new 매핑 → text | read |
| 산출 | (Patch op 들) | — | 출력 형태이며 도구 아님 |

> **확장이 도구를 못 정의한다 = 안전성** — T1/T2 는 새 능력을 코드로 들이지 못하고, 우리가 검증한 도구만 조합한다. 새 능력이 필요하면 T3 플러그인으로 가야 하고, 그 시점부터는 signed/unsigned 신뢰도 게이트가 작동한다.

## 10.5 등록 우선순위 (충돌 시) / Resolution order on collision

같은 슬래시 이름이 두 단계에서 정의되면 우선순위:

```
workspace T1/T2  >  workspace T3 (사용자 설치)  >  org default plugin  >  VelugaLore 기본 코어
```

충돌 발생 시 명령 팔레트에 출처 라벨(`workspace` · `plugin` · `core`) 을 표시. 사용자는 어느 정의를 쓸지 명시적으로 선택 가능.
