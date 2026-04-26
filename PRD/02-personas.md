---
section: 2
title: "페르소나와 유스케이스 / Personas & Use Cases"
parent: WekiDocs PRD
status: Draft (implementation-ready)
last_updated: 2026-04-26
---

# 2. 페르소나와 유스케이스 / Personas & Use Cases

## 2.1 1차 페르소나 / Primary Personas

각 페르소나의 **1차/2차 코어 동사** 를 명시한다. 우리 코어는 5개(`draft / improve / ask / ingest / curate`, §5)이지만 페르소나마다 매일 누르는 동사는 다르다 — 그 차이가 곧 첫 화면 디폴트와 온보딩 동선의 차이가 된다.

| 코드 | 페르소나 | 1차 동사 | 2차 동사 | 핵심 잡 (JTBD) | 성공 지표 |
|---|---|---|---|---|---|
| **P-IND** | 개인 연구자/지식 노동자 (Karpathy 스타일) | `ingest` · `ask` | `curate` | 매일 들어오는 논문·아티클·노트를 영구 누적 지식으로. 한 달에 한 번 정도 wiki 구조를 다시 잡고 싶다. | 30일 내 wiki 페이지 200+, 재방문/주 ≥ 4, `/ask` 응답이 새 wiki 페이지로 자동 저장된 비율 ≥ 60% |
| **P-STARTUP** | 10–50인 스타트업 (PM/디자이너/엔지니어 혼재) | `draft` · `improve` | `ask` | PRD/RFD/메모를 같은 에디터에서 쓰고 동료 리뷰 전 다듬는다. 결정 추적용으로 `ask` 자주. | 팀당 활성 문서 ≥ 100, 1인당 `/draft + /improve` ≥ 10/주 |
| **P-EDU** | 대학·학교 (강사/조교/학생) | `ingest` · `curate` | `ask` · `draft` | 학기 초 자료를 대량 들이고, 학기 중반에 주차/토픽별로 구조를 잡는다. 학생은 매일 `ask`. | 과목당 노드 ≥ 50, 학기말 누적 그래프, 학생 `/ask` 평균 응답 만족도 ≥ 4/5 |
| **P-ENT** | 중견·대기업 부서 (감사·권한 필수) | `curate` · `ask` · `import` | `ingest` · `draft` | 사규·정책 망의 일관성을 자동 유지하고, 직원이 셀프서비스로 답을 찾는다. 사규 개정 시 영향받는 다른 정책을 자동 추적. | RBAC 위반 0, 사규 개정 영향분석 자동화율 ≥ 80%, 직원 `/ask` 셀프해결률 ≥ 50% |

> **읽는 법** — *1차 동사가 없으면 그 페르소나에게 우리는 *덜* 의미 있다.* P-ENT 의 1차가 `curate` 라는 점은 큰 변화다. 이전엔 RBAC/감사가 1차로 보였지만, 사실 P-ENT 의 진짜 가치는 **사규·정책의 망(網)이 변경에 따라 자동으로 모양을 다시 잡는다** 는 점이다. RBAC/감사는 그 가치를 *전달 가능하게* 만드는 조건이지 가치 자체가 아니다.

## 2.2 핵심 유스케이스 / Top Use Cases

5개 코어 동사 + 시스템 작업(import, 변경이력, daily compile) 을 한 줄에 한 흐름씩.

1. **U1 · "기존 문서 대량 업로드(import)"** — 사규집·업무매뉴얼·온보딩가이드·기존 정책문서(`.docx`/`.md`/Notion·Confluence export/`.pdf`-as-document) 를 폴더 단위로 드롭 → `ImportAgent` 가 폴더 구조·헤딩 트리·내부 링크·첨부·표를 보존한 채 **편집 가능한 wiki 노드** 로 1:1 이관. 이관 비용이 0 에 수렴해야 도입 의사결정이 떨어진다. **P-ENT/P-EDU 의 1차 진입점.**
2. **U2 · "원자료 ingest → 파생 wiki"** — PDF 논문·웹 아티클·이미지를 `inbox/` 에 드롭 → 코어 `IngestAgent` 가 *파생* wiki 페이지(요약/엔티티/개념)를 생성하고 인덱스 갱신. 원자료는 `raw_sources` 에 불변 보관. **P-IND 의 매일 흐름.** (U1 과의 차이: U1=기존 wiki 자체, U2=원천에서 새 wiki 파생.)
3. **U3 · "/curate 로 wiki 구조 진화"** — 진짜 위키에서 사람들이 하던 일: 새 카테고리 신설, 페이지 분할/합치기, 분류 재배치, 고아 페이지 입양, 인덱스 재구성. 사용자가 명시 호출(`/curate scope:wiki/policies`) 하거나, 누적 ingest 가 임계점을 넘으면 야간 compile 이 제안. **P-EDU 의 학기 중반 정리, P-ENT 의 사규 개정 후 망 재배치 핵심 흐름.**
4. **U4 · "/draft 로 글 시작"** — 빈 문서에 `/draft 5장짜리 정부 R&D 제안서 개요` → 코어 `DraftAgent` 가 섹션 트리·초안을 삽입. **P-STARTUP 의 매일 흐름.** (더 구조적인 개요는 1st-party 확장 `/plan` 활성화.)
5. **U5 · "/improve 로 다듬기"** — 선택 영역에 3개 톤 옵션 diff. **P-STARTUP 의 동료 리뷰 직전, P-ENT 의 정책 개정 직전 흐름.**
6. **U6 · "/ask 로 wiki 에 질문 → 답이 누적"** — 자연어 질문 → 검색 + 답변. 답은 새 wiki 페이지(`kind='qa'`) 로 자동 저장되어 다음 질문에 재사용. *컴파운딩 루프의 후반부.* **모든 페르소나 공통, P-IND/P-EDU/P-ENT 의 매일 흐름.**
7. **U7 · "기존 문서 업데이트 + 변경이력 기록"** — 임포트된 사규에 사용자가 변경을 가하면 `doc_versions` 에 인간/에이전트 출처 기록 + 영향받는 다른 문서 자동 추적. 임의 시점으로 `/diff`/`/blame`/`/revert`. **P-ENT 1순위 협업 시나리오.**
8. **U8 · "Daily compile (백그라운드 ingest+curate)"** — 야간 잡이 새 raw 를 ingest 하고, 임계점을 넘은 카테고리에 curate 를 *제안* (자동 적용 아님 — approval queue). log.md 에 모든 활동 기록.

### 코어 5개 동사 = compounding 루프 / Three-axis loop

```
        (자라남)
        ┌──────── ingest ─────────┐
        │                          ▼
   raw 자료 ──────────────────▶ wiki 노드들
                                   │
                  (모양 잡기)        │
              curate ◀──────────────┤  (사람이 직접 쓰기)
              │     │                │     ▲
              │     │                │     │  draft / improve
              │     ▼                │     │
              │  카테고리·분할·이동·인덱스   │
              │                            │
              └────────── ask ─────────────┘
                  (꺼내 쓰기 + 답이 새 페이지로 누적)
```

`ingest` 가 자료를 들이고, `curate` 가 모양을 잡고, `ask` 가 꺼내 쓰며 답을 다시 누적시킨다. 이 셋이 **Karpathy 비전의 3축**이다. `draft` / `improve` 는 사용자가 직접 쓸 때의 워드프로세서 동선 — 비-테크 사용자(특히 P-STARTUP) 흡수를 위해 코어에 함께 둔다.

> **Ingest vs Import 한 줄 요약 — One-line distinction**
>
> *Ingest 는 원천 → 새 wiki 페이지를 파생한다. 원본은 read-only.*
> *Import 는 기존 편집 자산 → wiki 노드 그 자체. 이관 후 사용자가 직접 편집한다.*
> 두 경로는 코드·권한·UX·테이블 분리되어 있다(§5, §8.2).

## 2.3 페르소나별 첫 90일 동선 / 90-day journey by persona

### P-IND (Karpathy 스타일)
```
Day 1   onboarding → workspace·Postgres·LLM provider 선택
Day 1   inbox/ 에 첫 PDF 드롭 → ingest 3페이지 생성 → 그래프 첫 점등
Day 2-7 매일 1-3개 source 추가, /ask 시작 (답이 새 wiki 페이지로 누적)
Week 4  wiki 가 100+ 페이지 → 그래프에 클러스터 형성
Week 6  /curate 첫 실행 → 자동 카테고리 제안 → 사용자 승인 → 인덱스 재구성
Day 90  wiki 200+ 페이지, /ask 가 자기 wiki 를 1차 출처로 사용
```

### P-STARTUP
```
Day 1   onboarding → 팀 workspace, RBAC, Slack/Notion 연결(MCP)
Week 1  팀원이 /draft 로 첫 PRD 시작 → /improve 로 다듬어 PR 머지
Week 2  /ask 로 "지난 분기 결정사항" 질의 → 답이 새 wiki 페이지로 저장
Week 6  분기말 → /curate 로 분기 문서 재정리(폴더 구조 변경 제안)
Day 90  팀당 100+ 활성 문서, 신규 입사자 /ask 셀프 온보딩
```

### P-EDU
```
Day 1   강사: 학기 자료 zip 을 /import (강의노트 50+ 노드)
Week 1-2 학생들에게 access → /ask 로 "이 개념 강의자료 어디?"
Week 6  학기 중반: /curate 로 주차/토픽별 재정리 → 새 인덱스 페이지
Week 8  과제 피드백을 /draft + /improve 로 양산
Day 90 (학기말) 누적 wiki + 그래프 시각화 → 다음 학기 자산
```

### P-ENT
```
Day 1   IT/HR: 사규·매뉴얼 zip 을 /import → 200+ 노드, RBAC 적용
Week 1  /curate 첫 실행 → 카테고리 제안 검토 → 인덱스 페이지 자동 생성
Week 2  직원에게 read 권한 오픈 → /ask 셀프서비스 시작
Week 4  사규 개정안 → /improve + /review → 영향받는 다른 정책 자동 추적
Week 8  /curate 가 정책망 변경 적응 (분할/합치기 제안 → admin approval)
Day 90  RBAC 위반 0, 직원 /ask 셀프해결률 ≥ 50%, 사규 영향분석 자동화율 ≥ 80%
```
