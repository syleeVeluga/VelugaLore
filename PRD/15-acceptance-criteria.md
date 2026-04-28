---
section: 15
title: "수용 기준 / Acceptance Criteria (v1 GA)"
parent: VelugaLore PRD
status: Draft (implementation-ready)
last_updated: 2026-04-26
---

# 15. 수용 기준 / Acceptance Criteria (v1 GA)

## 15.1 정확성 / Correctness

- A1 · 패치 멱등성: 동일 patch 두 번 적용해도 `body_sha256` 변동 없음.
- A2 · raw 불변성: `raw_sources` UPDATE 시도 시 100/100 거부.
- A3 · 슬래시 파서: 카탈로그의 모든 명령에 대해 fuzz 1만회 무크래시.
- A4 · FS-DB 일관성: 손편집 1k건 + 에이전트 1k건 인터리브 후 sha256 mismatch 0건.
- A5 · Import 충실도(docx/md): 표·번호매김·헤딩 트리 보존율 ≥ 0.9 (골든셋 50개 문서).
- A6 · Import 내부 링크 재매핑: 원본의 상호 참조 중 ≥ 95% 가 wiki `[[link]]` 로 정확 변환, 나머지는 깨진 링크 리포트.
- A7 · Import 트랜잭션성: 한 `/import` 실행은 한 `import_runs` 행으로 묶여 단일 명령으로 rollback 가능. 부분실패 시 `status='partial'` + 충돌 리포트.
- A8 · Import 후 편집 가능성: 임포트된 모든 wiki 노드는 직후 `/Simplify`/`/Review`/`/Crosslink` 의 정상 대상 (스모크 100%).
- A9 · Refactor 안전성: `/refactor` 의 preview 와 실제 적용 결과 간 diff 0 (동일성 보장), 한 명령으로 inverse 가능.
- A10 · Diff/Blame 정확성: 임의 두 리비전 비교 시 한 줄 단위 추적 100%, blame 의 actor/run 매핑 누락 0건.
- A11 · LSP 진단 응답성: 깨진 링크·고아 노드 검출이 1만 노드 workspace 에서 변경 발생 후 200ms 내 빨간 밑줄.
- A12 · Curate 안전성 — 백링크 보존: `split_doc`/`merge_docs`/`move_doc` 후 workspace 내 모든 백링크 정확도 100% (id 기반 + 마크다운 재작성). stub redirect 가 외부 링크 깨짐 0건.
- A13 · Curate 트랜잭션성: 한 `/curate` 호출의 모든 op 가 한 `agent_runs` 행에 묶이고 단일 `/revert run:<id>` 로 100% 정확 inverse.
- A14 · Curate 결정 동의: 자동 적용 0회. 모든 IA 변경 op 는 §11.4 approval queue 를 통과한 뒤에만 반영. 분석 모드에서는 *제안만* 표시.
- A14.1 · 수동 페이지/폴더 관리: 사용자는 파일트리에서 새 페이지/폴더 생성, 이름변경, drag/drop 이동, 복제, 보관/삭제, 복원, 태그·kind 편집을 수행할 수 있다. 모든 조작은 §11.1 2-phase write, `doc_versions`, `audit_log` 를 통과하고 백링크/stub 불변식을 깨지 않는다. 분석 모드에서는 구조 변경 버튼이 비활성화된다.
- A15 · Ingest fan-out: 한 raw 가 평균 3~10 wiki 노드를 갱신/생성 (골든셋 30개 raw 기준). 단일 노드 생성에 그치는 비율 ≤ 20%.
- A16 · 컴파운딩 정상 동작: `/ask` 응답 중 ≥ 60% 가 `kind='qa'` 페이지로 자동 저장되고, 같은 workspace 의 다음 `/ask` 검색에서 1차 후보로 사용됨.
- A17 · 검색 정확도 (`/find`): 골든셋 100 쿼리에서 정답 노드의 평균 rank ≤ 3 (top-3 hit ≥ 90%). 3-way (literal/fuzzy/semantic) 모두 단독 사용 시보다 RRF 합성이 더 나아야 함.
- A17.1 · grep 정확성 (`/grep`): 골든셋 30 정규식(예: `\[\[[^\]]*\]\]`, `\b(갑|을)\b`, `^kind:\s*policy$`) 에서 ripgrep 출력과 byte-by-byte 동일. multiline·context·invert_match·whole_word 옵션 회귀 테스트 100% 통과.
- A18 · 비교 정밀도 (`/compare prose`): 골든셋 50쌍의 사람 라벨링과 비교해 aligned paragraph pair F1 ≥ 0.8.
- A19 · 중복 탐지 (`/duplicates`): 임포트한 200노드 골든셋(중복 그룹 30개 라벨링)에서 precision ≥ 0.9, recall ≥ 0.8 (threshold 0.85 기준).
- A20 · 클러스터 라벨 (`/cluster`): 자동 라벨이 사람 라벨과 cosine 유사도 ≥ 0.7 인 비율 ≥ 70% (골든셋 20 클러스터).

## 15.2 성능 / Performance

- P1 · 노트 1만개 workspace 부팅 ≤ 3s (M2 Mac, NVMe).
- P2 · `/draft` p50 응답 ≤ 4s (claude sonnet 기준), p95 ≤ 9s.
- P2.1 · `/curate` (100노드 scope) preview 생성 p50 ≤ 8s, p95 ≤ 20s.
- P3 · 그래프뷰 5,000 노드 60fps, 50,000 노드 30fps (WebGL).
- P4 · `/compile --since=24h` 1k dirty 페이지에서 ≤ 60s.
- P5 · `/find` 검색 (의미·RRF) — 1만 노드 workspace 에서 p50 ≤ 500ms, 10만 노드에서 p50 ≤ 1.5s, p95 ≤ 3s (RRF 3-way 합성 포함).
- P5.1 · `/grep` 검색 (regex) — 1만 노드 단순 literal p50 ≤ 200ms, 10만 노드 ≤ 1s. context lines 추가 시 추가 비용 ≤ 20%. output_mode='count' 는 1만 노드 ≤ 100ms.
- P6 · `/compare prose` 두 평균 길이(2000 단어) 노드 비교 p50 ≤ 3s.
- P7 · `/duplicates` 1,000노드 scope 에서 p50 ≤ 8s, 10,000 노드 ≤ 60s (embedding kNN + 후처리).
- P8 · `/cluster` 1,000노드 scope 에서 p50 ≤ 12s, 10,000 노드 ≤ 90s (HDBSCAN).

## 15.3 안전·권한 / Safety

- S1 · `web_fetch`, `ocr`, MCP 외부 도구는 approval queue 통과 없이 실행 0회.
- S2 · 비밀 패턴(API 키 등) 본문 진입 시 100% 마스킹 알림 (regression 테스트셋).
- S3 · audit_log 누락 0% (1,000 액션 샘플).

## 15.4 협업 / Collaboration

- C1 · reader 가 write 액션 시도 시 100% 거부 + audit.
- C2 · 같은 문서 연속 편집 시 last-writer-wins 머지 정확도 ≥ 99%.

## 15.5 사용성 / Usability

- U1 · 신규 사용자 첫 wiki 페이지 작성까지 5분 이내 (P-IND 5인 사용성 테스트).
- U2 · 슬래시 메뉴는 모든 명령에 1줄 도움말 + 예시 제공.
- U3 · 키보드만으로 "ingest → preview → apply → graph view" 완료 가능.
