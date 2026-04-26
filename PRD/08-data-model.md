---
section: 8
title: "데이터 모델 / Data Model (PostgreSQL 16+)"
parent: WekiDocs PRD
status: Draft (implementation-ready)
last_updated: 2026-04-26
---

# 8. 데이터 모델 / Data Model (PostgreSQL 16+)

## 8.1 설계 원칙 / Principles

1. **파일 ↔ 행 동등** — `workspace/wiki/foo.md` 와 `documents` 행은 항상 동기화. 둘 중 하나가 진실 근원이 아니라, 둘 다 갱신하는 트랜잭션을 보장한다(2-phase write, §11.1).
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

-- 2. workspaces & docs
CREATE TABLE workspaces (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name            text NOT NULL,
  fs_root         text,             -- desktop only; null on browser
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE TABLE raw_sources (           -- IMMUTABLE
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  uri             text NOT NULL,    -- file://..., https://..., s3://...
  mime            text NOT NULL,
  sha256          bytea NOT NULL,
  bytes           bigint NOT NULL,
  imported_by     uuid REFERENCES users(id),
  imported_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, sha256)
);
CREATE OR REPLACE FUNCTION raw_sources_no_update() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'raw_sources is immutable'; END $$ LANGUAGE plpgsql;
CREATE TRIGGER tg_raw_sources_no_update BEFORE UPDATE ON raw_sources
  FOR EACH ROW EXECUTE FUNCTION raw_sources_no_update();

CREATE TABLE documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  path            text NOT NULL,                          -- e.g., wiki/concepts/llm-wiki.md
  title           text NOT NULL,
  kind            text NOT NULL CHECK (kind IN
                    ('concept','entity','source','overview','index','log','qa','summary','slides','draft','stub')),
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
  UNIQUE (workspace_id, path)
);
CREATE INDEX documents_kind_idx        ON documents (workspace_id, kind);
CREATE INDEX documents_updated_idx     ON documents (workspace_id, updated_at DESC);
CREATE INDEX documents_body_tsv_idx    ON documents USING gin (body_tsv);
CREATE INDEX documents_body_trgm_idx   ON documents USING gin (body gin_trgm_ops);
CREATE INDEX documents_frontmatter_idx ON documents USING gin (frontmatter jsonb_path_ops);
CREATE INDEX documents_embedding_idx   ON documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 2b. import_runs (bulk import of existing docs: 사규/매뉴얼/Notion·Confluence export 등)
--     단위: 한 번의 /import 작업. 같은 run 내 문서들은 묶어서 rollback 가능.
CREATE TABLE import_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
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
CREATE INDEX import_runs_workspace_time ON import_runs (workspace_id, started_at DESC);

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
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name     text NOT NULL,
  PRIMARY KEY (workspace_id, name)
);
CREATE TABLE document_tags (
  doc_id  uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  name    text NOT NULL,
  PRIMARY KEY (doc_id, name),
  FOREIGN KEY (workspace_id, name) REFERENCES tags(workspace_id, name) ON DELETE CASCADE
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
  workspace_id    uuid REFERENCES workspaces(id),             -- nullable for global builtins
  version     text NOT NULL,
  capabilities jsonb NOT NULL,                        -- tools, scopes, limits
  prompt_path text,                                   -- workspace/.weki/agents/<id>.md
  enabled     bool NOT NULL DEFAULT true,
  UNIQUE (id, workspace_id)
);

CREATE TABLE agent_runs (                             -- append-only
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
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
CREATE INDEX agent_runs_workspace_time ON agent_runs (workspace_id, started_at DESC);

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
  workspace_id    uuid REFERENCES workspaces(id),
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
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  s_doc_id  uuid REFERENCES documents(id) ON DELETE CASCADE,
  p         text NOT NULL,                            -- predicate URI/slug
  o_doc_id  uuid REFERENCES documents(id) ON DELETE CASCADE,
  o_literal jsonb,                                    -- if object is literal
  weight    real NOT NULL DEFAULT 1.0,
  source    text NOT NULL CHECK (source IN ('agent','human','derived')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX triples_spo ON triples (workspace_id, s_doc_id, p);
CREATE INDEX triples_pos ON triples (workspace_id, p, o_doc_id);
```

## 8.3 RLS / Row-Level Security (요지)

- `org_id` 가 있는 테이블에 모두 RLS 활성화.
- 정책: `current_user_org_ids()` 가 반환하는 집합에 속할 때만 SELECT/UPDATE.
- 데스크톱 single-user 모드에서도 RLS 켜둔다 (코드 분기 줄이려고).

## 8.4 Patch JSON 스키마 / Patch JSON shape

```ts
// packages/core/src/patch.ts
export type PatchOp =
  // ── 본문 편집 (draft / improve / 1st-party 확장이 주로 사용) ────────────
  | { kind: 'replace_range'; doc_id: string; from: number; to: number; text: string }
  | { kind: 'insert_section_tree'; doc_id: string; at: number; tree: SectionNode[] }
  | { kind: 'insert_checklist'; doc_id: string; at: number; items: string[] }
  | { kind: 'insert_link'; doc_id: string; at: number; target_doc_id: string; alias?: string }
  | { kind: 'insert_footnote'; doc_id: string; at: number; mark: string; body: string }
  | { kind: 'replace_section'; doc_id: string; section: string; body: string }

  // ── 노드 생성 (ingest / ask / import 가 주로 사용) ──────────────────────
  | { kind: 'create_doc'; path: string; kind: DocumentKind; title: string; body: string; frontmatter?: Record<string, unknown> }

  // ── 인덱스/로그 (시스템) ──────────────────────────────────────────────
  | { kind: 'update_index'; entries: IndexEntryPatch[] }
  | { kind: 'append_log'; line: string }

  // ── 정보 아키텍처 변경 (curate 만 사용, approval 필수) ──────────────────
  | { kind: 'split_doc'; doc_id: string; cuts: { at: number; new_path: string; new_title: string; carry_frontmatter?: boolean }[]; leave_stub: boolean }
  | { kind: 'merge_docs'; doc_ids: string[]; into_path: string; into_title: string; redirect_strategy: 'stub' | 'tombstone'; preserve_history: true }
  | { kind: 'move_doc'; doc_id: string; new_path: string; relink: boolean }
  | { kind: 'adopt_orphan'; doc_id: string; parent_index_doc_id: string; section?: string };

export interface Patch {
  id: string;
  agent_run_id: string;
  ops: PatchOp[];
  rationale?: string;
  preview_html?: string;
}
```

모든 op 는 멱등 가능해야 한다(재적용 시 같은 결과). `replace_range` 는 `body_sha256` 으로 sanity check.

### 8.4.1 정보 아키텍처 변경 op 의 필수 보장 / Invariants for IA ops (`split_doc` / `merge_docs` / `move_doc` / `adopt_orphan`)

이 4개 op 는 workspace 의 *모양* 을 바꾸기 때문에 다음을 *모두* 보장해야 한다.

1. **History 보존** — 분할/합치기/이동 전후의 원본 노드는 `doc_versions` 에 마지막 rev 가 남아 있어야 한다. revert 가 항상 가능.
2. **Stub redirect** — 기본은 원래 경로에 redirect stub 노드(`kind='stub'`, body 는 새 경로 안내) 를 남긴다. `redirect_strategy='tombstone'` 일 때만 path 자체를 free 한다 (외부 링크가 없을 때만).
3. **백링크 자동 재배치** — 기존 `links.dst_doc_id` 는 노드 id 기반이므로 path 가 바뀌어도 깨지지 않는다. body 안의 마크다운 `[[wiki link]]` 는 별도로 자동 rewrite (text-level patch).
4. **Triple 그래프 동기화** — `triples` 의 s/o 가 변경된 doc 을 가리키면 자동 갱신.
5. **트랜잭션 단위 = curate run** — 한 `/curate` 호출이 만들어내는 모든 op 는 한 `agent_runs` 행에 묶이고, 한 명령(`/revert run:<id>`) 으로 통째로 rollback 가능.
6. **Approval 필수** — `requires_approval=true` (§11.4). 자동 적용 금지.
7. **편집 충돌 검사** — 적용 시점에 대상 doc 의 `rev` 가 patch 작성 시점과 동일해야 함. 다르면 `ConflictError` → 사용자에게 머지 다이얼로그.

---

## 8.5 인덱스 전략·크기·embedding·HNSW 마이그레이션 / Indexing strategy, sizing, embeddings, HNSW migration

### 8.5.1 인덱스 종류와 용도 / Indexes by purpose

`documents` 테이블 위에 다음 인덱스가 동시에 존재한다 — 검색 3-way (§4.3.1 F-3) 와 메타 필터를 모두 지원하기 위함.

| 인덱스 | 종류 | 컬럼 | 용도 (§4.3.1 F-3 매핑) | 비고 |
|---|---|---|---|---|
| `documents_kind_idx` | btree | (workspace_id, kind) | kind 필터 (검색 + 일반 쿼리) | 작음 |
| `documents_updated_idx` | btree | (workspace_id, updated_at desc) | "최근 변경 우선" 정렬 | 작음 |
| `documents_body_tsv_idx` | GIN | body_tsv (tsvector) | **literal/BM25** (search_workspace) | 중간 |
| `documents_body_trgm_idx` | GIN | body gin_trgm_ops | **fuzzy** + grep regex 후보 좁힘 | 큼 |
| `documents_frontmatter_idx` | GIN | frontmatter jsonb_path_ops | JSONPath 필터, kind/import meta | 작음~중간 |
| `documents_embedding_idx` | ivfflat → HNSW | embedding (vector_cosine_ops, workspace default 1536d/openai-3-small) | **semantic** (search_workspace, compare/duplicates/cluster) | 큼 (가장) |

> **trade-off** — pg_trgm 은 매우 강력하지만 인덱스 크기가 크다(보통 body 본문의 1.5~2배). workspace 가 100만 노드 이상으로 가면 trgm 비활성 + grep 으로 fallback 옵션 검토. v1 기본은 켜둠.

### 8.5.2 인덱스 크기 추정 / Index size estimates

가정: 평균 노드 본문 2,500 단어 (≈ 15 KB UTF-8), 평균 frontmatter 200 bytes, **embedding 1536d float32** (v1 default = OpenAI `text-embedding-3-small`).

| Workspace 규모 | body 합계 | tsv GIN | trgm GIN | frontmatter GIN | embedding 1536d (ivfflat lists=100) | embedding 1536d (HNSW m=16) | embedding 1024d (truncated) |
|---|---|---|---|---|---|---|---|
| 1k 노드 | ≈ 15 MB | ≈ 6 MB | ≈ 25 MB | ≈ 0.5 MB | ≈ 6 MB | ≈ 9 MB | ≈ 4 MB |
| 10k | ≈ 150 MB | ≈ 60 MB | ≈ 250 MB | ≈ 5 MB | ≈ 60 MB | ≈ 90 MB | ≈ 40 MB |
| 100k | ≈ 1.5 GB | ≈ 0.6 GB | ≈ 2.5 GB | ≈ 50 MB | ≈ 0.6 GB | ≈ 0.9 GB | ≈ 0.4 GB |
| 1M | ≈ 15 GB | ≈ 6 GB | ≈ 25 GB | ≈ 0.5 GB | ≈ 6 GB | ≈ 9 GB | ≈ 4 GB |

(참고치 — ±30% 변동. CREATE INDEX 후 `\dt+` 와 `pg_relation_size()` 로 실제 측정. 1024d 컬럼은 §8.5.3 의 Matryoshka 차원 축소 옵션 사용 시.)

**저장 정책**:
- 데스크톱(Postgres.app local): 10k 노드까지는 무난, 100k 부터 디스크 100 GB+ 권장.
- 셀프호스트/클라우드: 임의 크기 가능하나 1M+ 부터 파티셔닝(by `workspace_id`) 검토.
- 1k 노드 이하인 신규 workspace 는 ivfflat 자체를 *생략* 하고 sequential scan — embedding 비용 회피 (§8.5.4).

### 8.5.3 embedding 차원·모델 선택 기준 / Embedding model & dimension

> **결정 (D13, §17.3)** — v1 GA 디폴트는 **OpenAI `text-embedding-3-small` (1536d)**. 한·영 multilingual 품질 + 차원 축소(Matryoshka) + 안정 SLA. 자세한 정책은 §4.4.2.

| 옵션 | 차원 | 인덱스 크기 (1M docs, ivfflat) | 품질 (MTEB-Ko 참고치) | 결정 |
|---|---|---|---|---|
| **`text-embedding-3-small`** (OpenAI) | **1536** | **≈ 6 GB** | ≈ 70 | **v1 default** |
| `text-embedding-3-small` truncated | 1024 (또는 256) | ≈ 4 GB (1024) | ≈ 69 | **인덱스 크기 우려 시** Matryoshka 차원 축소 옵션 |
| `text-embedding-3-large` (OpenAI) | 3072 | ≈ 12 GB | ≈ 73~75 | 품질 1순위 시 (1024d truncated 권장) |
| `BAAI/bge-m3` (로컬) | 1024 | ≈ 4 GB | ≈ 72 | data sovereignty 옵션 (v1.5+) |
| Voyage / Cohere | 1024 | ≈ 4 GB | ≈ 71~73 | v1.5+ |

#### 정책

- **Provider 우선순위 (D13)** — OpenAI `text-embedding-3-*` 가 v1 우선. 다른 provider 는 토글. (§4.4.2)
- **모델 추상화** — pydantic-ai 의 model-agnostic 위에서 workspace 별 embedding provider 선택 (`workspace/.weki/config.toml` 의 `[embedding]` 섹션).
- **차원 변경은 *비파괴* 변경** — `embedding` 컬럼 타입은 `vector(N)` 으로 고정이지만, 다른 차원으로 갈 때는 `embedding_v2 vector(M)` 컬럼을 추가하고 dual-write 하다가 마이그레이션. 절대 in-place 차원 교체 금지 (인덱스 invalid).
- **Matryoshka 차원 축소** — `text-embedding-3-*` 의 `dimensions` 파라미터로 1536→1024 또는 256 까지 truncate 가능. 인덱스 크기↓ + 검색 품질 손실 작음. 마이그레이션 없이 *새 노드부터* 적용 가능.
- **Quantization** — pgvector 0.7+ 의 `halfvec`(16-bit). 1536d × 1M ≈ 6 GB → 3 GB. 품질 손실 < 1% (자체 측정 후 결정).
- **로컬 옵션** — 데이터 외부 노출이 불가한 사용자(공공/금융)는 `bge-m3-onnx` 로컬 추론 (CPU 1ms/100단어). v1.5+ 공식 지원, v1 에선 Skill/플러그인으로 우회 가능.

#### Workspace 별 설정

```toml
# workspace/.weki/config.toml
[embedding]
provider = "openai"
model = "text-embedding-3-small"
dimensions = 1536          # 또는 1024 (truncated, 인덱스 ↓)
batch_size = 100
```

### 8.5.4 ivfflat → HNSW 마이그레이션 경로 / ivfflat → HNSW migration

**v1 GA 시점**:
- `documents_embedding_idx` = `ivfflat` (lists=100). pgvector 0.5+ 에서 안정.
- 1k–100k 노드 범위에서 충분.

**언제 HNSW 로 옮기는가** (트리거 조건):
1. workspace 가 100k 노드를 넘는다.
2. ivfflat 의 검색 p95 가 3s 를 넘기 시작한다.
3. *동적 workspace* — 매일 1k 이상 노드 추가/수정. ivfflat 은 lists 재학습이 가끔 필요(REINDEX), HNSW 는 incremental 친화.
4. embedding 모델을 바꾼다 (어차피 인덱스 다시 만들어야 하니 같이 갈아탐).

**마이그레이션 절차** (zero-downtime):

```sql
-- 1. 새 컬럼·인덱스 만들기 (기존은 그대로)
ALTER TABLE documents
  ADD COLUMN embedding_v2 vector(1024);

-- 2. dual-write 시작 (앱 코드)
--    INSERT/UPDATE 시 embedding 과 embedding_v2 동시에 채움.
--    pydantic-ai 워커가 새 모델로 v2 채움.

-- 3. backfill (배치 잡, 청크 단위, 야간)
UPDATE documents SET embedding_v2 = ai_embed(body)
  WHERE embedding_v2 IS NULL
  AND id IN (SELECT id FROM documents WHERE embedding_v2 IS NULL LIMIT 1000);
-- 진행률 모니터링

-- 4. HNSW 인덱스 빌드 (CREATE INDEX CONCURRENTLY 로 락 회피)
CREATE INDEX CONCURRENTLY documents_embedding_v2_idx
  ON documents USING hnsw (embedding_v2 vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 5. read path 컷오버 — search_workspace 쿼리에서 embedding → embedding_v2

-- 6. 모니터링 1주: 품질·성능 회귀 0 확인

-- 7. 옛 컬럼·인덱스 제거
DROP INDEX documents_embedding_idx;
ALTER TABLE documents DROP COLUMN embedding;
ALTER TABLE documents RENAME COLUMN embedding_v2 TO embedding;
ALTER INDEX documents_embedding_v2_idx RENAME TO documents_embedding_idx;
```

**HNSW 파라미터 튜닝**:

| 파라미터 | v1 권장 | trade-off |
|---|---|---|
| `m` | 16 | ↑ → 정확도↑, 인덱스↑, 메모리↑ |
| `ef_construction` | 64 | ↑ → 빌드 느림, 인덱스 품질↑ |
| `ef_search` (쿼리 시) | 40 | ↑ → 정확도↑, 검색 느림 |

테스트로 100k 노드에서 m=16/ef_search=40 일 때 recall@10 ≈ 0.97, p50 ≈ 50ms 측정.

### 8.5.5 인덱스 유지보수 / Maintenance

| 작업 | 빈도 | 명령 | 비고 |
|---|---|---|---|
| `ANALYZE documents` | 매시간 (autovacuum) | `ANALYZE documents` | 통계 갱신, planner 정확도 |
| `VACUUM` | autovacuum 기본 | (자동) | dead tuple 회수 |
| `REINDEX CONCURRENTLY` (ivfflat) | 노드 ±20% 변동 시 | `REINDEX INDEX CONCURRENTLY documents_embedding_idx` | lists 재배치, ivfflat 만 |
| `pg_repack` (대용량) | 분기 | extension | 디스크 단편화 회수 |

**모니터링 지표** (`/admin/metrics`, §12):
- `pg_stat_user_indexes.idx_blks_hit` 비율 (캐시 히트)
- 평균 쿼리 시간 by index
- ivfflat의 `lists` vs 실제 클러스터 분포 (REINDEX 트리거)

### 8.5.6 검색 시 인덱스 사용 — RRF 쿼리 형태 / Query shape under RRF

`search_workspace` 의 3-way 가 한 SQL 트랜잭션에서 어떻게 인덱스를 쓰는지 (개념 EXPLAIN):

```sql
-- 사용자 쿼리: "근속연수 정의" + filter kind='policy'
WITH
  literal_hits AS (
    SELECT id, ts_rank(body_tsv, plainto_tsquery('근속연수 정의')) AS s
    FROM documents
    WHERE workspace_id = $1 AND kind = 'policy'
    AND body_tsv @@ plainto_tsquery('근속연수 정의')
    ORDER BY s DESC LIMIT 50
  ),                               -- documents_body_tsv_idx + documents_kind_idx
  fuzzy_hits AS (
    SELECT id, similarity(body, '근속연수 정의') AS s
    FROM documents
    WHERE workspace_id = $1 AND kind = 'policy'
    AND body % '근속연수 정의'
    ORDER BY s DESC LIMIT 50
  ),                               -- documents_body_trgm_idx
  semantic_hits AS (
    SELECT id, 1 - (embedding <=> $2::vector) AS s
    FROM documents
    WHERE workspace_id = $1 AND kind = 'policy'
    AND embedding IS NOT NULL
    ORDER BY embedding <=> $2::vector LIMIT 50
  ),                               -- documents_embedding_idx
  ranked AS (
    SELECT id, SUM(1.0 / (60.0 + r)) AS rrf_score FROM (
      SELECT id, ROW_NUMBER() OVER (ORDER BY s DESC) AS r FROM literal_hits
      UNION ALL
      SELECT id, ROW_NUMBER() OVER (ORDER BY s DESC) AS r FROM fuzzy_hits
      UNION ALL
      SELECT id, ROW_NUMBER() OVER (ORDER BY s DESC) AS r FROM semantic_hits
    ) u GROUP BY id ORDER BY rrf_score DESC LIMIT 20
  )
SELECT d.* FROM documents d JOIN ranked r ON d.id = r.id ORDER BY r.rrf_score DESC;
```

세 갈래가 *병렬로* 인덱스 탄 후 RRF 로 합쳐진다. EXPLAIN 으로 각 갈래의 인덱스 사용 확인 필수 (§13.5 코드 리뷰 체크리스트 #2).
