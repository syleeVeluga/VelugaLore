---
section: 11
title: "보안·권한·동기화 / Security, RBAC, Sync"
parent: VelugaLore PRD
status: Draft (implementation-ready)
last_updated: 2026-04-26
---

# 11. 보안·권한·동기화 / Security, RBAC, Sync

## 11.1 파일 ↔ DB 일관성 / FS-DB consistency

Postgres 가 진실 근원(D1, §17.3)이지만 사용자가 외부 에디터로 파일을 직접 만지는 경로도 인정한다. 두 진실이 *동시에 갱신* 되어야 한다.

### 11.1.1 두 가지 쓰기 경로 / Two write paths

```
A. 앱 내 편집 (renderer → core)         B. 외부 편집 (Obsidian, vim 등)
   사용자/에이전트가 본문 변경              사용자가 .md 파일 직접 수정
        │                                          │
        ▼                                          ▼
   2-phase write (§11.1.2)                  FS watcher (debounce 5s)
        │                                          │
        ▼                                          ▼
   ┌────────────┐                            ┌────────────┐
   │   Postgres │  ◄────── reconcile ─────►  │  filesystem│
   └────────────┘                            └────────────┘
```

### 11.1.2 2-phase write — 앱 내 편집 / 2-phase write (in-app)

```
1. BEGIN transaction
2. UPDATE documents
     SET body = $new, body_sha256 = sha256($new),
         rev = rev + 1, updated_at = now(),
         last_editor = $actor
     WHERE id = $doc AND rev = $prev_rev
   ─→ 0 rows affected → ConflictError (사용자 머지 다이얼로그, §11.1.4)

3. INSERT INTO doc_versions (rev, body, body_sha256, source, agent_run_id)

4. fsync to tmp file:  workspace/.weki/.tmp/$doc.md.<txid>
   (raw bytes write + fsync)

5. atomic rename:  $tmp → workspace/wiki/$doc.path
   (rename(2) on POSIX, MoveFileEx with MOVEFILE_REPLACE_EXISTING on Win)

6. fsync containing dir (POSIX)

7. COMMIT (Postgres)
   - 만약 5/6 중 어느 단계에서 실패: ROLLBACK + tmp 파일 삭제 + 사용자에게 알림
```

**보장**:
- 한 op 가 *부분 적용* 되지 않는다 — 둘 다 성공 또는 둘 다 롤백.
- 다른 프로세스가 같은 path 를 동시에 보면 항상 *완성된* 한 버전을 본다 (atomic rename).
- 시스템 크래시 시 다음 부팅에서 reconcile (§11.1.5).

### 11.1.3 FS watcher path — 외부 편집 / Watcher reconcile

외부 에디터(Obsidian, vim, VS Code) 가 파일을 직접 수정한 경우.

```
파일 변경 이벤트 (notify-rs)
  ↓
debounce 5s (사용자가 연속 저장 중일 수 있음)
  ↓
파일 sha256 계산
  ↓
documents.body_sha256 와 비교
  ├── 같음 → no-op
  ├── 다름 + last_editor='human' → fast-forward (DB 갱신, doc_versions, source='sync')
  └── 다름 + last_editor='agent' (적용된 patch 가 있던 자리) → 충돌
                                                            → 머지 다이얼로그 (§11.1.4)
```

### 11.1.4 충돌 머지 다이얼로그 / Conflict merge dialog

```
┌────────────────────────────────────────────────────────────────────┐
│ Conflict: wiki/policies/근태.md                  rev 17 vs FS       │
│ ────────────────────────────────────────────────────────────────── │
│ DB (rev 17, agent improve, 14:02):    │ FS (외부 편집, 14:08):       │
│  근속연수는 입사일~퇴직일 사이의 만   │  근속연수는 입사일부터 퇴직일까지의│
│  연수로 한다 [[정의-연도]].           │  만 연수로 정의한다 [[정의-연도]].│
│                                       │                              │
│ ────────────────────────────────────────────────────────────────── │
│ Three-way merge (base = rev 16):                                   │
│  ✓ 자동 머지 가능 항목 3개                                          │
│  ⚠ 수동 결정 필요 1개 (위 단락)                                     │
│                                                                    │
│ [K] Keep DB     [F] Keep FS     [M] 둘 다 보존(다른 file 로 분기)  │
│ [E] 직접 편집 후 [A] Apply                                         │
└────────────────────────────────────────────────────────────────────┘
```

옵션 동작:
- **K (Keep DB)** — FS 의 변경을 무시하고 DB 의 rev 17 로 파일을 덮어씀. doc_versions 에 `source='sync',action='kept_db'` 기록.
- **F (Keep FS)** — FS 의 변경을 진실로 받아들임. DB rev 18 로 갱신, source='human' (외부 편집자 추정).
- **M (둘 다 보존)** — DB 버전은 그대로, FS 변경은 `wiki/conflicts/근태-2026-04-26-1408.md` 로 분기 보존. 사용자가 나중에 직접 머지.
- **E (직접 편집)** — 인앱 3-way 머지 에디터 열림.

### 11.1.5 부팅 시 reconcile / Boot-time reconcile

앱 시작 또는 workspace 열 때:

```
1. SELECT id, path, body_sha256, rev FROM documents WHERE workspace_id = $w
2. for each doc:
     fs_sha = sha256(read workspace/$path)
     if fs_sha != documents.body_sha256:
        if doc has unflushed pending patch:  # 크래시 직전 §11.1.2 의 5/6 사이에서 죽음
           rollback (delete tmp, DB 가 진실)
        else:                                 # 외부 편집
           enqueue conflict for user resolution
3. 사용자에게 conflict count 알림 (있다면)
```

### 11.1.6 보장·예외 / Guarantees & non-goals

**보장**:
- 모든 패치 적용은 atomic (file + DB).
- 외부 에디터 변경은 절대 *조용히* 덮어써지지 않는다.
- doc_versions 가 모든 source(`human`/`agent`/`sync`)를 기록.

**비-목표**:
- 동시 편집 (멀티 사용자가 같은 doc 를 같은 순간에 편집) — v2 의 CRDT 작업 (§3.2 EditOp 노트).
- FS 권한이 없는 환경 (브라우저) — 자체 OPFS 만 미러, 외부 watcher 없음.

---

## 11.2 모드 / Modes

세 가지 운영 모드. 같은 코드 베이스, 설정만 다름.

| 모드 | 대상 페르소나 | RBAC | Audit | SSO | DLP | 자동 승인 |
|---|---|---|---|---|---|---|
| **Solo** | P-IND | 비활성 (single user) | local only | n/a | n/a | 사용자 명시 시 |
| **Team** | P-STARTUP, P-EDU | `owner|admin|editor|reader` | DB audit_log | OAuth (GitHub/Google) | n/a | editor 자기 patch |
| **Enterprise** | P-ENT | 위 + 그룹 | DB + S3 export | SAML/SCIM | DLP 훅 | 정책 따름 |

전환은 *데이터 이동 없이* 설정만으로 가능 — Solo 의 single-user vault 가 admin 1명인 Team 으로 변환됨.

## 11.3 RBAC 매트릭스 / RBAC matrix

| 액션 | reader | editor | admin | owner |
|---|---|---|---|---|
| 문서 읽기 (vault 범위) | ✓ | ✓ | ✓ | ✓ |
| 문서 직접 편집 | – | ✓ | ✓ | ✓ |
| 슬래시 명령 — read agents (`/find`/`/grep`/`/ask`/`/diff`/`/blame`/`/lint`/`/compare`/`/duplicates`/`/cluster`) | ✓ | ✓ | ✓ | ✓ |
| 슬래시 명령 — write agents (`/draft`/`/improve`/`/ingest`) | – | ✓ | ✓ | ✓ |
| 슬래시 명령 — IA 변경 (`/curate`/`/refactor`) | – | ✓ (제안만) | ✓ | ✓ |
| Patch 적용 (자기 제안) | – | ✓ | ✓ | ✓ |
| Patch 적용 (다른 사람 제안) | – | – | ✓ | ✓ |
| `/import` (대량 이관) | – | – | ✓ | ✓ |
| `/revert run:<id>` | – | ✓ (자기 run) | ✓ | ✓ |
| 외부 도구 호출 (`web_fetch`, MCP) | – | – (admin 승인 필수) | ✓ (승인자) | ✓ |
| 에이전트 추가/삭제 (`agents.toml`) | – | – | ✓ | ✓ |
| Skill/플러그인 설치 | – | – | ✓ | ✓ |
| AGENTS.md 변경 | – | – | ✓ | ✓ |
| RBAC 변경 (멤버 role) | – | – | – | ✓ |
| Audit export | – | – | ✓ | ✓ |
| Workspace 삭제 | – | – | – | ✓ |

### 11.3.1 RLS 정책 (Postgres) / Row-Level Security policies

```sql
-- 모든 도메인 테이블에 RLS 활성
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
-- (links, tags, agent_runs, patches, audit_log, doc_versions, raw_sources, import_runs, triples 모두)

-- 현재 사용자가 속한 org_id 들 (세션 변수로 설정)
CREATE OR REPLACE FUNCTION current_user_org_ids() RETURNS uuid[] AS $$
  SELECT array_agg(org_id)
  FROM memberships
  WHERE user_id = current_setting('app.user_id', true)::uuid;
$$ LANGUAGE sql STABLE;

-- 정책: workspaces 는 사용자가 속한 org 의 것만
CREATE POLICY workspaces_org_isolation ON workspaces
  USING (org_id = ANY (current_user_org_ids()));

-- 정책: documents 는 자기 workspace 의 documents 만
CREATE POLICY documents_workspace_isolation ON documents
  USING (workspace_id IN (SELECT id FROM workspaces));
  -- (workspaces 의 RLS 가 이미 org 격리, 중첩됨)

-- 정책: write 는 role 이 editor 이상일 때
CREATE POLICY documents_write ON documents
  FOR UPDATE USING (
    workspace_id IN (SELECT id FROM workspaces)
    AND EXISTS (
      SELECT 1 FROM memberships m
      JOIN workspaces w ON w.org_id = m.org_id
      WHERE w.id = documents.workspace_id
        AND m.user_id = current_setting('app.user_id', true)::uuid
        AND m.role IN ('owner','admin','editor')
    )
  );
```

**특별 정책**:
- `raw_sources` 는 *update 자체 불가* (트리거 §8.2).
- `audit_log` 는 INSERT only — RLS 가 UPDATE/DELETE 를 차단.
- `agent_runs` 는 INSERT + status 컬럼만 UPDATE.

세션 변수 설정은 `agent-server` 미들웨어가 매 요청마다:
```sql
SET LOCAL app.user_id = '<jwt.sub>';
```

## 11.4 Human-in-the-loop / Approval Queue

§7.7 UI 와 짝이 되는 *시스템 측* 명세.

### 11.4.1 무엇이 큐를 거치는가 / What requires approval

| 카테고리 | 디폴트 정책 | AGENTS.md 의 §4 로 오버라이드 가능 |
|---|---|---|
| 코어 `/draft`, `/improve` patch | RBAC editor 자기 patch 면 자동, 그 외 큐 | yes (예: "모든 코어 patch 는 admin 승인") |
| 코어 `/ask` (qa 페이지 생성) | 자동 (low-risk) | yes |
| 코어 `/ingest` patch | 자동 (low-risk, raw 는 immutable) | yes |
| **코어 `/curate` 의 IA op** | **항상 큐 (D9, D11)** | 강화만 가능 (admin × 2 등), 비활성 불가 |
| `/import` (대량) | 항상 큐 (admin 승인) | 강화만 가능 |
| 1st-party 확장 `/refactor` | 항상 큐 (editor × 2 default) | strengthen/weaken 가능 |
| 외부 도구 호출 (`web_fetch`, MCP) | **항상 큐 (D11)** | 강화만 가능, 비활성 불가 |
| Skill/플러그인 설치 | 항상 큐 (admin) | 강화만 |

### 11.4.2 큐 상태 머신 / Queue state machine

```
proposed → (approval) → applied
   │           │
   │           ↓
   ├──→ rejected (rationale 기록)
   │           │
   │           ↓
   └──→ superseded (다른 patch 가 같은 영역 변경)
```

타임아웃: pending 이 7일 넘으면 자동 `superseded` (rationale 자동 기록).

### 11.4.3 우회 금지 / No bypass

다음은 절대 자동 승인되지 않는다:
- "agreed in document" / "user pre-authorized" / 카운트다운 타이머 / "auto-accept after N seconds"
- CLI 플래그 `--auto-approve` 같은 우회 옵션은 **존재하지 않는다** (D11 구체화).
- AGENTS.md 의 §4 정책으로 *강화*만 가능, *완화* 불가 (디폴트가 항상 하한).

## 11.5 비밀·키 / Secrets

### 11.5.1 저장 / Storage

| 비밀 종류 | 저장 위치 | 비고 |
|---|---|---|
| LLM provider API 키 | OS keychain (macOS Keychain · Windows Credential Manager · libsecret) | desktop 만. 웹에선 사용자 토큰 BYO를 server-side 에서 |
| Postgres 비밀번호 | (디폴트) socket peer auth 또는 OAuth (Supabase/Neon) | 비밀번호 직접 저장 회피 |
| Git push 토큰 | OS keychain | 푸시 시점만 사용 |
| MCP 서버 시크릿 | OS keychain (mcp.toml 에서 `${SECRET_NAME}` 변수 참조) | mcp.toml 에 평문 금지 |
| 사용자 OAuth 세션 | secure cookie (HttpOnly, SameSite=Strict, Secure) + JWT signed by server | 웹만 |

### 11.5.2 본문에 들어오는 비밀 감지 / Secret detection in body

사용자가 실수로 본문에 API 키·토큰 등을 붙여넣는 경우 client-side 감지.

```
패턴 카탈로그 (정규식 + entropy):
- AWS Access Key:        AKIA[0-9A-Z]{16}
- AWS Secret:            [A-Za-z0-9/+=]{40}             (entropy ≥ 4.5)
- GitHub PAT:            ghp_[A-Za-z0-9]{36}
- GitHub OAuth:          gho_[A-Za-z0-9]{36}
- Stripe Live:           sk_live_[A-Za-z0-9]{24,}
- OpenAI API key:        sk-[A-Za-z0-9]{20,}
- Anthropic API key:     sk-ant-[A-Za-z0-9-_]{80,}
- Google API key:        AIza[A-Za-z0-9_-]{35}
- Slack token:           xox[bpoa]-[A-Za-z0-9-]{10,}
- Generic JWT:           eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+
- Generic high-entropy:  [A-Za-z0-9+/=]{40,}            (entropy ≥ 5.0)

탐지 시 동작:
1. 즉시 인라인에서 마스킹 (●●●● 표시) + 툴팁 "비밀로 추정되는 값"
2. 사용자에게 dialog: "정말 본문에 넣으시겠습니까? [편집기로 복귀] [그대로 진행 — 위험]"
3. 그대로 진행 시 documents.frontmatter._secret_warnings 에 위치 기록
4. /grep 결과 + audit_log 에서 영원히 추적 가능
```

회사 정책상 *절대* 비밀이 들어오면 안 되는 workspace 는 AGENTS.md 에 `secrets_policy: forbid` 설정 — 탐지 시 자동 거절(저장 자체 차단).

### 11.5.3 SSO·SAML·SCIM / Enterprise auth

P-ENT 모드에서:
- **SSO** — SAML 2.0 (Okta/Azure AD/Google Workspace), OIDC 옵션.
- **SCIM** — 사용자 프로비저닝 자동화 (조인/이탈 시 멤버십 자동 갱신).
- **IP allowlist** — workspace 단위, CIDR 목록.
- **Session 정책** — idle timeout, max session age, MFA required.

## 11.6 감사 / Audit logging

### 11.6.1 모든 액션이 audit_log 행 / Every action is one row

`audit_log` (§8.2) 에 다음을 *모두* 기록:

| 액션 | actor_kind | 비고 |
|---|---|---|
| 사용자 로그인/로그아웃 | user | IP, user-agent |
| Patch proposed | agent or user | 어떤 에이전트 / 어떤 사용자 |
| Patch approved/rejected | user | RBAC role + 결정 시점 |
| Patch applied | system | 트랜잭션 결과 |
| /import run | user | source_summary |
| /curate run | user (invoked) + agent (proposed) | 두 행 |
| 외부 도구 호출 | agent | tool, args (PII 마스킹), result hash |
| AGENTS.md / agents.toml 변경 | user | diff |
| RBAC 변경 | user (owner) | before/after |
| Workspace 생성/삭제 | user | |

### 11.6.2 Audit export (admin)

`weki audit export --workspace=<id> --since=<date> --format=csv|json` — admin 권한 필요. PII 는 옵션 마스킹.

## 11.7 보안 비-목표 / Security non-goals (v1)

- **End-to-end encryption** — Postgres 가 진실 근원이므로 server 측 plaintext 가 불가피. v2 옵션 검토 (CRDT 위에서 client-side keys).
- **하드웨어 키 (YubiKey 등)** — SSO 가 처리. 우리 자체 구현 안 함.
- **Bring-your-own-key (KMS)** — Postgres 의 column encryption 옵션. v2.
- **공인 인증 (KISA, FIPS)** — v1 GA 대상 아님. P-ENT 가 필요로 하면 v1.5+.
