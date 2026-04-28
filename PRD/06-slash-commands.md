---
section: 6
title: "슬래시 명령 명세 / Slash Command Spec"
parent: VelugaLore PRD
status: Draft (implementation-ready)
last_updated: 2026-04-26
---

# 6. 슬래시 명령 명세 / Slash Command Spec

## 6.1 명령 문법 / Grammar

```
/<verb> [target] [-- argname value] [--flag] [following natural-language args]
```

예시:

코어 5개:

- `/draft` — 빈 문서면 개요+초안, 선택 영역이면 그 영역 확장.
- `/draft 정부 R&D 제안서 5장 -- audience 정부심사위원` — 인자 명시.
- `/improve` — 선택 영역에 3개 톤 옵션 diff.
- `/improve --tone executive --maxWords 120`
- `/ask 이 노트와 가장 연결도 높은 페이지 5개는?` — 답이 새 wiki 페이지로 자동 저장.
- `/ingest path:./inbox/2026-04-arxiv.pdf` — raw → 파생 wiki 페이지.
- `/curate scope:wiki/policies` — 정책 폴더의 카테고리·분할/합치기·인덱스 재구성 *제안* (approval 후 적용).
- `/curate --since 7d --threshold 30` — 최근 7일에 ingest 된 페이지가 30개를 넘은 카테고리 자동 진단.

시스템:

- `/import path:./onboarding-zip/사규-2026.zip --target wiki/policies --preserve-tree --remap-links`
- `/import path:./manuals/ --target wiki/manuals --kind draft` (대량 폴더 임포트)
- `/find 근속연수 정의 --kind concept --since 2025-01-01` — 3-way + RRF (자연어 의미 검색).
- `/find 휴가 사용 절차 --mode semantic --topk 10` — 의미 검색만.
- `/find "exact phrase" --mode literal --frontmatter '$.kind == "policy"'` — JSONPath 필터.
- `/grep '\[\[[^\]]*\]\]' --output content --context 1` — 모든 wiki link 위치 (정확 정규식, opencode Grep 직역).
- `/grep '\b(갑|을)\b' --kind policy --output files_with_matches` — 금칙어 위반 파일 목록.
- `/grep '^kind:\s*policy$' --body-only false --output count` — frontmatter 통계.
- `/compare doc:사규-2025 doc:사규-2026 --mode prose` — 두 사규의 항목 정렬·차이.
- `/compare doc:정책-A doc:정책-B --mode set` — 다루는 항목의 집합 비교.
- `/duplicates scope:wiki/inbox --threshold 0.9` — 임포트 직후 거의 같은 노드 그룹.
- `/cluster scope:wiki/policies --k auto` — 카테고리 자동 제안 (curate 사전 단계).
- `/diff doc:사규-제2장 --rev 12 --rev 17`
- `/blame range:42:118` (현재 문서의 42–118자 범위)
- `/revert run:9b14...` (한 import_run 또는 curate run 되돌리기)

확장 (활성화 후):

- `/plan` — 더 구조적인 섹션 트리.
- `/simplify --tone executive`
- `/refactor "사원" -> "구성원" --scope wiki/policies --exclude wiki/legacy --preview`

## 6.2 명령 매핑 표 / Command Mapping Tables

코어(v1 동봉)·시스템(workspace 운영)·확장(marketplace) 으로 분리 (§5 와 정합).

### 6.2.1 코어 / Core (v1 GA 동봉, 즉시 활성)

| Slash | Agent | Selection 필요? | Multi-doc? | Default Apply Mode |
|---|---|---|---|---|
| `/draft` | `draft` | 선택 시 해당 영역, 없으면 빈 문서 | no | dry-run preview |
| `/improve` | `improve` | yes | no | preview-3-options |
| `/ask` | `ask` | n/a | yes (search) | append-as-new-doc |
| `/ingest` | `ingest` | n/a (target=path) | no | confirm-then-apply |
| `/curate` | `curate` | n/a (target=scope) | yes | preview-then-approval (구조 변경은 항상 사람 확인) |

### 6.2.2 시스템 / System ops (v1 동봉)

| Slash | 작업 | Selection 필요? | Multi-doc? | Default Apply Mode |
|---|---|---|---|---|
| `/import` | `import` | n/a (target=folder/zip/file) | yes (bulk) | confirm-then-apply (preview 트리 + 충돌 표시) |
| `/find` | `find` | n/a | yes | ranked panel (literal+fuzzy+semantic 3-way, RRF — 자연어/의미용) |
| `/grep` | `grep` | n/a (regex) | yes | content/files/count modes (opencode Grep 직역 — 정확 패턴용) |
| `/compare` | `compare` | n/a (target=2 docs) | n/a | side-by-side diff + similarity score |
| `/duplicates` | `duplicates` | n/a (target=scope) | yes | grouped report + "merge?" 제안 |
| `/cluster` | `cluster` | n/a (target=scope) | yes | clusters + 자동 라벨 제안 |
| `/diff` | `diff` | n/a | no | report only |
| `/blame` | `blame` | yes (range) | no | report only |
| `/revert` | `revert` | n/a | depends on target | confirm-then-apply |
| `/lint` | `lint` | n/a | yes | report only |
| `/compile` | `compile` | n/a | yes | scheduled or manual (curate 제안 자동 트리거 가능) |

### 6.2.3 1st-party 확장 / Extensions (사용자 활성화 후 노출)

| Slash | Agent | Selection 필요? | Multi-doc? | Default Apply Mode |
|---|---|---|---|---|
| `/plan` | `plan` | optional | no | dry-run preview |
| `/expand` | `expand` | yes | no | preview |
| `/simplify` | `simplify` | yes | no | preview-3-options |
| `/crosslink` | `crosslink` | no | no | inline-suggest |
| `/review` | `review` | no | optional | report only |
| `/summarize` | `summarize` | n/a (target=doc(s)) | yes | confirm |
| `/outline` | `outline` | no | no | apply |
| `/translate` | `translate` | yes | no | preview |
| `/cite` | `cite` | yes | no | preview |
| `/slides` | `slides` | no | no | confirm |
| `/diagram` | `diagram` | optional | no | preview |
| `/refactor` | `refactor` | optional (scope) | yes | preview-multi-doc → confirm |

> **사용자 정의 슬래시 명령** — `workspace/.weki/agents/<id>.md` + `agents.toml` 등록만으로 즉시 추가됨. §10 참조.

## 6.3 파서 컨트랙트 / Parser contract (TypeScript)

```ts
// packages/core/src/slash/parse.ts
export interface SlashInvocation {
  verb: string;                // "plan"
  target?: SlashTarget;        // selection | docId | path | none
  args: Record<string, string | boolean | number>;
  freeText?: string;           // natural-language tail
  raw: string;                 // the original input
}

export type SlashTarget =
  | { kind: 'selection'; docId: string; from: number; to: number }
  | { kind: 'doc'; docId: string }
  | { kind: 'path'; path: string }
  | { kind: 'query'; query: string };

export function parseSlash(input: string, ctx: EditorContext): SlashInvocation;
```

`parseSlash` 는 순수 함수. 검증 실패 시 `SlashParseError` 를 던진다. 자동완성은 `verb` 와 `argname` 양쪽에 작동.
