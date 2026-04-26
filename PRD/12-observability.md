---
section: 12
title: "옵저버빌리티·에이블·비용 / Observability, Evals, Cost"
parent: WekiDocs PRD
status: Draft (implementation-ready)
last_updated: 2026-04-26
---

# 12. 옵저버빌리티·에이블·비용 / Observability, Evals, Cost

## 12.1 Tracing — OpenTelemetry

### 12.1.1 어디까지 트레이스되는가 / What's traced

```
HTTP 요청 (renderer → agent-server)
  └── Span: slash.invoke verb=draft
        └── Span: agent.draft
              ├── Span: prompt.build (AGENTS.md + skills + agent prompt)
              ├── Span: llm.call provider=anthropic model=claude-sonnet-4-6
              │     └── attrs: tokens.in, tokens.out, latency, cost_usd
              ├── Span: tool.search_workspace                       
              │     └── Span: db.query                              
              ├── Span: tool.read_doc
              ├── Span: pydantic.validate output_schema=DraftPatch
              └── Span: patch.preview-html
        └── Span: queue.append (approval queue 추가)
```

각 스팬의 표준 attribute:
- `weki.workspace_id`, `weki.user_id`, `weki.agent_id`
- `weki.run_id` (= `agent_runs.id`), `weki.parent_run_id`
- `weki.mode` (`analyze`/`edit`)
- `weki.cost_usd_microcents`, `weki.tokens_in`, `weki.tokens_out`, `weki.model`

### 12.1.2 백엔드 / Backends

- **데스크톱 default** — local SQLite 에 30일 buffer. 사용자가 *명시 opt-in* 해야 외부 OTLP 로 송신.
- **Team/Enterprise default** — OTLP → Pydantic Logfire (D3 연결, pydantic-ai 의 본가).
- **셀프호스트 옵션** — Tempo, Honeycomb, Datadog, Grafana Cloud — OTLP 표준이라 사용자가 선택.

### 12.1.3 PII / 민감 정보 정책

기본 redaction:
- `prompt.body`, `llm.response.text` 의 *내용 자체* 는 트레이스에 들어가지 않음. 대신 `body_sha256` + 길이만.
- 도구 결과의 `body`, `text` 도 동일.
- 사용자 명시 opt-in 시 (`workspace/.weki/config.toml` 의 `[telemetry] capture_prompt_bodies = true`) 만 본문 캡처.
- AGENTS.md `telemetry_policy: minimal | standard | full` 로 organization 정책.

```toml
# config.toml 예시
[telemetry]
otlp_endpoint = "https://logfire-api.pydantic.dev/v1/traces"
capture_prompt_bodies = false       # 기본 false (PII 보호)
sample_rate = 0.1                   # 10% 샘플링 (LLM 호출 외)
sample_rate_llm = 1.0               # LLM 호출은 100% (비용/품질 추적)
```

### 12.1.4 메트릭스 / Metrics (Prometheus / OTLP metrics)

| 메트릭 | 타입 | 차원 |
|---|---|---|
| `weki_slash_invocations_total` | Counter | verb, mode, status |
| `weki_agent_run_duration_seconds` | Histogram | agent_id, status |
| `weki_llm_tokens_total` | Counter | provider, model, kind(in/out) |
| `weki_llm_cost_usd_microcents_total` | Counter | provider, model |
| `weki_patch_proposed_total` | Counter | agent_id, ops_count |
| `weki_patch_approval_decision_total` | Counter | decision(approved/rejected/superseded) |
| `weki_search_latency_seconds` | Histogram | tool(find/grep/glob), workspace_size_bucket |
| `weki_curate_op_total` | Counter | op(split/merge/move/adopt_orphan/index) |
| `weki_eval_score` | Gauge | agent_id, golden_set_id |

---

## 12.2 Evals — `pydantic_evals` 골든셋

### 12.2.1 골든셋 위치·형식 / Location & format

```
packages/agent-runtime-py/evals/
├── draft/
│   ├── 001-empty-doc-rd-proposal.yaml
│   ├── 002-selection-expand.yaml
│   └── ... (30+)
├── improve/
│   ├── 001-tone-executive.yaml
│   └── ...
├── ask/
├── ingest/
├── curate/                    # §13.6.6 형식
└── system/                    # find, grep, compare, duplicates, cluster
```

### 12.2.2 케이스 형식 (draft 예) / Case format

```yaml
id: draft-001
title: "빈 문서 → 정부 R&D 제안서 5장"
agent: draft
fixture: fixtures/empty.json     # 입력 workspace 스냅샷
agents_md: |
  default_mode: edit
  글쓰기 톤: 공식 '~합니다' 체.

invocation:
  slash: /draft 5장짜리 정부 R&D 제안서 개요 -- audience 정부심사위원

assertions:
  output_schema: DraftPatch
  ops_kinds_must_include: [insert_section_tree, append_paragraph]
  sections_count: { eq: 5 }
  paragraph_count: { gte: 5 }
  body_words_total: { gte: 800, lte: 1500 }
  contains_phrases: ["사업 필요성", "기대효과"]
  not_contains: ["예상됩니다", "할 것으로 보입니다"]   # 수동태/예측체 회피
  rationale_lang: ko

scoring:
  pass: 모든 assertions 통과
  partial: ops/sections OK + 단어 수 ±10%
  fail: 그 외

# ─── 회귀 게이트 ───
regression:
  baseline: 0.85               # 이전 GA 의 점수
  min_score: 0.80              # CI 차단 하한
```

### 12.2.3 채점 / Scoring & aggregation

각 에이전트마다:
- **per-case**: pass / partial(0.5) / fail(0)
- **per-agent score**: 가중 평균
- **regression**: 직전 main 의 점수 대비 Δ. Δ < -0.05 → CI 차단

### 12.2.4 CI 통합 / CI integration

```yaml
# .github/workflows/evals.yml
- name: Run evals
  run: pnpm evals --agents=core,system --output=evals.json

- name: Compare to baseline
  run: |
    baseline=$(curl -s $BASELINE_URL/evals.json)
    pnpm evals:diff --baseline="$baseline" --current=evals.json --max-regression=0.05

- name: Comment PR
  uses: actions/github-script@v7
  # 각 에이전트의 점수 변화를 PR 코멘트
```

PR 차단 게이트 — *어떤 에이전트라도* `score < min_score` 또는 `regression > 0.05` 이면 머지 불가.

### 12.2.5 LLM-as-judge / 품질 채점

코어 동사처럼 *생성 품질* 이 핵심인 케이스는 단순 assertion 외에 LLM-as-judge 추가.

```yaml
judge:
  model: anthropic:claude-sonnet-4-6     # 채점용은 더 큰 모델
  rubric: |
    1. 사업 필요성이 정량 근거(시장 규모, 기술 격차)를 포함하는가? (0-2)
    2. 기대효과가 측정 가능한가? (0-2)
    3. 톤이 정부 보고서 표준에 맞는가? (0-2)
    4. 섹션 간 논리 흐름? (0-2)
    5. AGENTS.md 의 톤 규칙 준수? (0-2)
  pass: total >= 8
  partial: total >= 6
  fail: total < 6
```

### 12.2.6 한국어/영어 양쪽 / Bilingual

각 코어 에이전트는 골든셋에 한국어·영어 케이스 각각 ≥ 15개. (i18n 회귀를 위해.)

### 12.2.7 골든셋 분포 (M5 GA 게이트) / Distribution at GA

| 에이전트 | 정상 케이스 | 실패 케이스 | LLM-judge | 총 |
|---|---|---|---|---|
| `draft` | 24 | 6 | 8 | 38 |
| `improve` | 24 | 6 | 8 | 38 |
| `ask` | 24 | 6 | 8 | 38 |
| `ingest` | 24 | 6 | 8 | 38 |
| **`curate`** | **24** | **6 (F1~F10 중 6)** | **12** | **42** (§13.6.6 와 정합) |
| 시스템 (find/grep/compare/duplicates/cluster) | 각 12 | 각 3 | n/a | 75 |
| **합계** | | | | **≥ 269** |

S-16 슬라이스(§13.3)의 DOD 와 연결 — "코어 5개 + 시스템 작업 evals 99% 통과".

---

## 12.3 비용 추적 / Cost tracking

### 12.3.1 데이터 / Data

`agent_runs` (§8.2) 의 컬럼:
- `cost_tokens` (in + out 합계)
- `cost_usd_microcents` (마이크로센트, USD 1 = 1,000,000)
- `model` (e.g., `anthropic:claude-sonnet-4-6`)

provider 별 단가 매트릭스는 `agent-runtime-py/pricing.toml` 에 — provider 가격 변동 시 업데이트.

### 12.3.2 사용자 대시보드 mockup / Cost dashboard

```
┌──────────────────────────────────────────────────────────────────────┐
│ Cost · Acme Co. workspace                       Apr 2026 · MTD  ▾    │
│ ────────────────────────────────────────────────────────────────────  │
│  This month     $42.18     (budget $100, 42% used) ▮▮▮▮▮▮▮▮▮▮░░░░░░ │
│  Last month     $89.12                                                │
│  Daily avg      $1.62      (peak: $4.81 on 2026-04-12)               │
│ ────────────────────────────────────────────────────────────────────  │
│  By agent (this month)                                                │
│    /ingest      $24.10  (57%)  ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮░░░░░░░░░░░░░░ │
│    /ask         $11.40  (27%)  ▮▮▮▮▮▮▮▮▮▮░░░░░░░░░░░░░░░░░░░░░░░░ │
│    /curate       $4.20  (10%)  ▮▮▮▮░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│    /draft        $1.80  (4%)                                          │
│    /improve      $0.68  (2%)                                          │
│ ────────────────────────────────────────────────────────────────────  │
│  By model                                                             │
│    anthropic:claude-sonnet-4-6   $32.10                               │
│    anthropic:claude-haiku-4-5     $6.50                               │
│    openai:text-embed-3-small      $3.58                               │
│ ────────────────────────────────────────────────────────────────────  │
│  Top expensive runs                                                   │
│    /ingest 회의록-Q1-2026.zip     $3.42  (12 docs, 320k tokens)      │
│    /curate scope:wiki/policies    $2.81  (cluster 5, 180k tokens)    │
│    ...                                                                │
│ ────────────────────────────────────────────────────────────────────  │
│  [Export CSV]  [Set budget]  [Configure alerts]                       │
└──────────────────────────────────────────────────────────────────────┘
```

### 12.3.3 알림 정책 / Budget alerts

`workspace/.weki/config.toml` 의 `[budget]` 섹션:

```toml
[budget]
monthly_usd = 100.00
alert_at = [50, 80, 100]       # % 도달 시 알림
hard_stop_at = 120              # 120% 초과 시 자동 차단 (설정 가능)
notify_emails = ["admin@acme.com"]
notify_webhook = "https://hooks.slack.com/..."
```

50/80/100% 도달 시 admin 에 알림. 120% 초과 시 *모든 LLM 호출 차단* (단, 사용자가 옵트인 시에만 hard_stop 활성).

### 12.3.4 Per-agent 비용 한도 / Per-agent budgets

특정 에이전트가 비용을 갉아먹는 패턴 방지. `agents.toml` 또는 vault config 에:

```toml
[agent.curate]
max_cost_per_run_usd = 1.00     # 한 호출당 $1 초과 시 abort
max_cost_per_day_usd = 20.00    # 하루 $20 초과 시 큐로 (admin 승인)
```

### 12.3.5 사용자 비용 가시성 / Inline cost UI

슬래시 명령 실행 직전·직후에 추정·실제 비용 표시.

```
/draft ...  →  실행 전: ~$0.02 예상  [실행]
              실행 후: $0.018 (anthropic:claude-haiku-4-5, 1.2s)
```

---

## 12.4 샘플링·보존 / Sampling & retention

### 12.4.1 트레이스 샘플링

- LLM 호출 스팬: 100% (비용/품질 추적의 핵심).
- 그 외 스팬: 10% (시스템 디버깅용).
- 에러 발생한 트레이스: 100% (소급 — error span 발견 시 전체 trace 강제 보존).

### 12.4.2 데이터 보존 / Retention

| 데이터 | 기본 보존 | 사용자 설정 |
|---|---|---|
| `agent_runs` (메타데이터) | 무제한 (감사 필요) | 명시 삭제만 |
| 트레이스 (원본 prompt/response) | 30일 | `[telemetry] retention_days = N` |
| `audit_log` | 무제한 | export 후 삭제만 |
| `doc_versions` | 무제한 | revert 가능성을 보장 |
| LLM 호출 본문 (opt-in 시) | 7일 default | 명시 설정 |

### 12.4.3 GDPR/개인정보 삭제 요청 / Right to erasure

사용자가 *자기 데이터* 삭제를 요청하면:
- `users.email` → null + tombstone 행
- 자기가 생성한 `documents` 의 `created_by` → null
- 자기 `agent_runs` 의 `invoked_by` → null
- 자기 `audit_log` 행은 `actor_id` 만 마스킹 (감사 보존)
- 트레이스의 본문은 즉시 purge

---

## 12.5 SLO / Service-level objectives (Team/Enterprise)

| SLO | 목표 | 측정 |
|---|---|---|
| 데몬 가용성 | 99.9% (월) | `weki_slash_invocations_total{status="success"} / total` |
| `/find` 응답 (P5) | 1만노드 p50 ≤ 500ms (§15) | `weki_search_latency_seconds` |
| `/draft` 응답 (P2) | p50 ≤ 4s | `weki_agent_run_duration_seconds{agent_id="draft"}` |
| Eval 회귀 | < 0.05 vs baseline | nightly + PR |
| 비용 budget 준수 | 사용자 budget 초과 0건 (hard_stop 활성 시) | `weki_llm_cost_usd_microcents_total` |

위 SLO 위반 시 admin 알림 + 다음 sprint 의 회복 작업 1순위.
