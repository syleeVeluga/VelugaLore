---
section: 9
title: "코드 구조 / Code Layout (TypeScript monorepo)"
parent: VelugaLore PRD
status: Draft (implementation-ready)
last_updated: 2026-04-26
---

# 9. 코드 구조 / Code Layout (TypeScript monorepo)

## 9.1 모노레포 / Monorepo

```
weki/
├─ package.json (pnpm workspaces, turborepo)
├─ packages/
│  ├─ core/                # shared types, patch logic, parsers (pure TS, no runtime deps)
│  ├─ db/                  # drizzle-orm schema, migrations, query helpers
│  ├─ desktop/             # Tauri 2 shell (Rust core + TS renderer bridge)
│  ├─ web/                 # Next.js 15 web app (renderer mirror)
│  ├─ editor/              # CodeMirror 6 + ProseMirror bridge
│  ├─ graph/               # graph view (sigma.js wrapper)
│  ├─ agent-server/        # HTTP+SSE daemon (TS, opencode-pattern reference)
│  ├─ agent-runtime-py/    # pydantic-ai workers (Python; published as wheel)
│  ├─ markdown-lsp/        # 자체 markdown LSP server (TS)
│  ├─ plugin-sdk/          # public API for community plugins
│  └─ cli/                 # `weki` command
├─ apps/
│  ├─ docs/                # Astro Starlight docs (apps/docs.weki.dev)
│  └─ marketing/           # Next.js (weki.dev)
├─ specs/                  # this PRD + design docs (PRD/, RFD/)
├─ vendor/                 # (옵션) 차용한 외부 패키지 + 패치. critical path 아님 (§4.3.2)
└─ tools/                  # 빌드 스크립트, codegen, migrations 헬퍼
```

## 9.2 패키지별 책임 + 임포트 규칙 / Package responsibilities & import rules

### 9.2.1 책임 매트릭스 / Responsibility matrix

| 패키지 | 한 줄 책임 | 누가 import 하는가 | 누구를 import 하는가 |
|---|---|---|---|
| `core` | 공유 타입·zod 스키마·Patch 로직·slash 파서 (§6.3) | 모두 | 0 (zod 외) |
| `db` | drizzle 스키마·migrations·쿼리 헬퍼 (§8) | `agent-server`, `agent-runtime-py` (간접), `cli` | `core`, `pg`, `drizzle-orm`, `pgvector` |
| `editor` | CodeMirror 6 + ProseMirror + slash menu UI | `desktop` renderer, `web` | `core` |
| `graph` | sigma.js 그래프뷰 (§7.5) | `desktop`, `web` | `core` |
| `agent-server` | HTTP+SSE 데몬, 세션·런 관리, MCP host (§4.3.1 A,B,G,H) | `desktop` core, `web` server, `cli` | `core`, `db`, `markdown-lsp` |
| `agent-runtime-py` | pydantic-ai 워커 (5 코어 + 시스템). `agent-server` 가 sub-process 로 spawn | `agent-server` (IPC) | `pydantic-ai`, `httpx`, `asyncpg` |
| `markdown-lsp` | LSP 진단 (깨진 link, 고아, 용어 불일치) | `agent-server`, `desktop`, `web` | `core`, `vscode-languageserver` |
| `desktop` | Tauri 2 셸 (Rust core + React renderer) | (release artifact, 의존되지 않음) | `core`, `editor`, `graph`, `agent-server`(bin), `markdown-lsp` |
| `web` | Next.js 15 앱 | (release artifact) | `core`, `editor`, `graph`, `agent-server`(http) |
| `plugin-sdk` | T3 플러그인용 공개 API (§10.2.3). SemVer 안정 표면 | 외부 플러그인 작성자 | `core` (re-export only) |
| `cli` | `weki` 명령 (compile, migrate, dev) | (release artifact) | `core`, `db`, `agent-server`(직접 spawn) |

### 9.2.2 임포트 규칙 (강제) / Import rules (enforced)

```
# .turbo/lint-deps.json 또는 ESLint import/no-restricted-paths 로 강제
core           → 다른 어떤 packages/* 도 import 금지
db             → core 만
editor/graph   → core 만
agent-server   → core, db, markdown-lsp 만 (renderer 패키지 import 금지)
desktop/web    → renderer 측만(editor, graph, core), agent-server 는 binary 또는 HTTP 로
plugin-sdk     → core re-export 만 (db/agent-server 직접 노출 금지 — 안정 표면)
```

위반 시 CI 차단 (`pnpm lint:deps`).

### 9.2.3 의존 그래프 / Dependency graph

```
                       ┌──────────────────┐
                       │      core        │  zero-runtime-deps
                       └────────┬─────────┘
              ┌─────────┬───────┼──────────┬──────────┬───────────┐
              ▼         ▼       ▼          ▼          ▼           ▼
            db      editor    graph    plugin-sdk  markdown-lsp  cli
              │         │       │                       │         │
              └─────────┼───────┼─────────┬─────────────┘         │
                        │       │         ▼                       │
                        │       │   agent-server  ────────────────┤
                        │       │         │                       │
                        ▼       ▼         ▼                       │
                       desktop / web  ◄──IPC──  agent-runtime-py  │
                                         (Python)                 │
                                                                  ▼
                                                  배포: dmg/exe/deb/AppImage/npm/pypi
```

## 9.3 의존성 정책 / Dependency policy

- `packages/core` — 런타임 의존성 0 (zod 만 허용). 새 의존 추가는 PR 리뷰에서 *기본 거절*.
- `packages/db` — `pg`, `drizzle-orm`, `pgvector` 만. ORM 우회(raw SQL)는 허용하되 `db/queries/<name>.sql` 에 둠 (검증 가능).
- `packages/desktop` Rust — `tauri`, `tokio`, `serde`, `notify` (FS watcher) 만. *gRPC/Web 프레임워크 추가 금지.*
- `packages/agent-server` (TS) — `hono`, `@modelcontextprotocol/sdk-typescript`, `vscode-languageserver` (LSP host), `pg` (직접 SQL 은 db/ 통해서만).
- `packages/agent-runtime-py` — `pydantic-ai`, `pydantic`, `httpx`, `sqlalchemy[asyncio]`, `asyncpg`. 풀옵션 모델 SDK 는 pydantic-ai 가 추상화하므로 따로 의존 안 함.
- `packages/markdown-lsp` — `vscode-languageserver-node`, `unified`/`remark` (마크다운 AST).
- `packages/plugin-sdk` — `core` 의 re-export 만. *추가 의존 0* — 사용자 플러그인의 의존을 줄이기 위함.

### 9.3.1 SemVer 표면 / Stable surfaces

| 표면 | SemVer 보장 | 변경 시 영향 |
|---|---|---|
| `core` 의 `Patch`/`PatchOp` 타입 (§8.4) | strict — minor 호환, major 만 깸 | 모든 에이전트·플러그인 |
| `plugin-sdk` 공개 API | strict | 외부 플러그인 |
| `agents.toml` 스키마 (§10.2.2) | strict | T2 마크다운 정의 에이전트 |
| `agent-server` HTTP+SSE 엔드포인트 | strict | 데스크톱·웹·CLI 클라이언트 |
| internal API (db 쿼리, 내부 패키지 export) | unstable | 내부만 |

## 9.4 빌드·테스트 매트릭스 / Build & test matrix

### 9.4.1 빌드 / Build

```
turbo run build        # 모든 패키지, 캐시 활용
turbo run build --filter=desktop...   # desktop 트리만
turbo run build --filter=...^plugin-sdk   # plugin-sdk 의 dependents
```

| 산출물 | 빌더 | 트리거 | 서명 |
|---|---|---|---|
| `desktop` macOS Apple Silicon `.dmg` | GH Actions macos-14 + Tauri | tag `v*` | apple notarization |
| `desktop` macOS Intel `.dmg` | GH Actions macos-13 | tag `v*` | apple notarization |
| `desktop` Windows `.exe` | GH Actions windows-2022 + signpath | tag `v*` | signpath signed |
| `desktop` Linux `.deb`/`.rpm`/`.AppImage` | GH Actions ubuntu-22.04 | tag `v*` | gpg |
| `web` 정적 번들 | Vercel | main push | n/a |
| `cli` npm 패키지 (`weki-cli`) | GH Actions + npm publish | tag `v*` | npm provenance |
| `agent-runtime-py` wheel (`weki-agents`) | GH Actions + uv publish | tag `v*` | pypi attestation |
| `plugin-sdk` npm 패키지 (`@weki/plugin-sdk`) | GH Actions + npm publish | tag `v*` | npm provenance |
| 도커 이미지 (셀프호스트 web+server) | GH Actions + ghcr.io | tag `v*` | cosign |

### 9.4.2 테스트 매트릭스 / Test matrix

| 레벨 | 도구 | 위치 | CI 게이트 |
|---|---|---|---|
| Unit (TS) | vitest | `packages/*/test/` | PR 차단 (실패 시) |
| Unit (Py) | pytest | `packages/agent-runtime-py/tests/` | PR 차단 |
| Integration (DB) | vitest + Postgres docker | `packages/db/test/integration/` | PR 차단 |
| Component | Playwright Component | `packages/editor/test/`, `packages/graph/test/` | PR 차단 |
| E2E (desktop) | Playwright + Tauri driver | `e2e/desktop/` | release 전 |
| E2E (web) | Playwright | `e2e/web/` | PR (cron 야간) |
| Evals | pydantic_evals | `packages/agent-runtime-py/evals/` | PR (회귀 체크), nightly |
| Bench (perf) | criterion (Rust), tinybench (TS) | `bench/` | nightly |
| Lint deps | 자체 스크립트 (§9.2.2) | `tools/lint-deps.ts` | PR 차단 |

### 9.4.3 CI 워크플로우 / CI workflow

```
PR opened
  ├── lint (eslint, prettier, ruff, lint:deps)
  ├── build (turbo, all packages)
  ├── unit (vitest, pytest)
  ├── integration (Postgres docker)
  ├── component (Playwright Component)
  ├── evals (golden set 회귀, 하한 게이트)
  └── (옵션) e2e (label 'e2e' 시)

Merge to main
  ├── 위 모두 + e2e (desktop, web)
  ├── nightly bench, full evals, security scan
  └── 야간 도커 이미지 publish (latest tag)

Tag v*
  ├── 위 모두 + 서명된 desktop 빌드 4 OS
  ├── npm/pypi/ghcr 동시 publish
  └── GitHub Release with auto-generated changelog
```

## 9.5 릴리스 채널·버전 정책 / Release channels & versioning

### 9.5.1 채널

| 채널 | 빈도 | 대상 | 자동 업데이트 |
|---|---|---|---|
| `stable` | 4–6주 | 일반 사용자 (P-IND/P-STARTUP/P-EDU/P-ENT) | yes (사용자 옵트인 가능) |
| `beta` | 1–2주 | 얼리 어답터 + 자체 dogfood | yes (옵트인) |
| `nightly` | 매일 | 개발자·플러그인 작성자 | manual download only |

### 9.5.2 버전 / SemVer

- 데스크톱·웹 앱: `MAJOR.MINOR.PATCH` (CalVer 옵션 검토 — `2026.04.0` 식, M5 후 결정).
- `plugin-sdk` / `agents.toml` 스키마 / `Patch` 타입: 엄격한 SemVer (D-stable surface 표 §9.3.1).
- 모델 ID(§17.2.2)·embedding default(§17.2.3)는 *스키마가 아닌 컨텐츠* — README CHANGELOG 로 관리, SemVer 비대상.

## 9.6 Codegen / 자동 생성 / Codegen

### 9.6.1 자동 생성되는 코드

| 입력 | 출력 | 도구 | 주기 |
|---|---|---|---|
| `db/schema.ts` (drizzle) | TypeScript 타입 + Python pydantic 모델 | drizzle-kit + 자체 ts→py 변환 | migrations 변경 시 |
| OpenAPI (`agent-server`) | TS 클라이언트 + Python 클라이언트 | `openapi-typescript` + `openapi-python-client` | server 라우트 변경 시 |
| Patch op 스키마 | TS Discriminated union + Python `BaseModel` | `core/src/patch.ts` 가 단일 진실, py 자동 변환 | core/patch 변경 시 |
| i18n 키 추출 | `core/src/i18n/<locale>.json` | `pnpm i18n:extract` | PR pre-commit |

### 9.6.2 수동 보장이 필요한 부분

- `agents.toml` 스키마는 사람이 읽기 위해 *문서 형태로* 단일 진실 (§10.2.2). 검증은 zod 스키마로 양방향 일치 단위테스트.
- `vault/.weki/AGENTS.md` 형식은 *자연어* — 파서가 best-effort 로 추출 (§10.2.0).

## 9.7 시작 명령 (개발자) / Bootstrap commands

```bash
# 첫 setup
pnpm install
pnpm db:up                      # Postgres 16 + pgvector docker compose
pnpm db:migrate                 # drizzle migrations
pnpm py:setup                   # uv venv + pip install agent-runtime-py

# 개발
pnpm dev                        # turbo run dev (모두)
pnpm dev --filter=desktop       # 데스크톱 셸만
pnpm dev --filter=web           # 웹만

# 테스트
pnpm test                       # vitest + pytest 전부
pnpm test:integration           # Postgres docker 시작 → 통합 테스트
pnpm evals                      # 골든셋 회귀 (코어 5개 + 시스템)

# 마이그레이션·codegen
pnpm db:generate-migration <name>
pnpm codegen                    # OpenAPI + Patch 스키마 양방향

# 패키지 배포
pnpm release                    # changesets → npm/pypi 동시
```

이 명령들은 `S-01` 슬라이스(§13.3)의 DOD 의 일부 — `pnpm i && turbo run build` 통과가 첫 게이트.
