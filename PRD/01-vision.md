---
section: 1
title: "비전과 문제정의 / Vision & Problem Statement"
parent: VelugaLore PRD
status: Draft (implementation-ready)
last_updated: 2026-04-26
---

# 1. 비전과 문제정의 / Vision & Problem Statement

## 1.1 비전 / Vision

**사용자(비-테크 포함)에게 보이는 모습 — End-user view**

> 자료를 폴더에 떨어뜨리면 문서가 자동으로 정리되어 쌓이고, 글을 쓰는 도중 `/` 한 번이면 "개요 잡아줘", "쉽게 다듬어줘", "관련 노트랑 연결해줘" 같은 일을 한 번에 처리한다. 옵시디언처럼 노트가 서로 링크로 이어지지만, 노트를 정리하는 일은 사람이 하지 않아도 된다.

**구현하는 쪽에게 보이는 모습 — Implementation view (for AI coding agents · engineers)**

> Obsidian-shaped editor where the LLM is a compiler, agents are slash commands, Postgres is the canonical store — desktop first, browser-equivalent later. 자료=raw, 노트=wiki, 작성 중 호출되는 모든 에이전트의 출력은 `Patch` 단일 통화로 표현된다.

## 1.2 해결하려는 문제 / Problem

| # | 문제 (Korean) | Problem (English) |
|---|---|---|
| P1 | RAG 챗봇은 매번 처음부터 답을 합성한다. 누적되지 않는다. | Today's RAG chats re-derive answers per query; knowledge does not compound. |
| P2 | 옵시디언은 강력하지만 LLM이 1급 시민이 아니다. 플러그인은 chat 사이드패널 수준. | Obsidian is strong but treats LLMs as a side panel, not as the system's compiler. |
| P3 | Claude Code/Cursor 같은 에이전트는 "코드"에 묶여 있어 비개발자가 문서 워크플로우에 끌어쓰기 어렵다. | Coding agents are coupled to code repos; non-engineers can't reuse the same agent UX for documents. |
| P4 | 기업은 자체 호스팅·감사 로그·권한이 필요한데, 마크다운 파일만으론 부족하다. | Enterprises need RBAC, audit logs, and a queryable store — markdown files alone are not enough. |
| P5 | 데스크톱과 브라우저에서 동일한 편집 경험이 필요한데, 대부분의 도구는 한쪽만 잘한다. | Same editor must be excellent on desktop *and* browser; most tools are good at only one. |

## 1.3 비-목표 / Non-goals (v1)

- 실시간 멀티커서 동시편집(Yjs/CRDT) 은 v2 이상으로 연기. v1 은 "동시편집 안전한 단일 작성자 + presence" 까지.
- 자체 LLM 학습/파인튜닝 파이프라인 제공 안 함. 모델은 외부 provider 또는 self-hosted endpoint 에 위임.
- 모바일 네이티브 앱 v1 미포함. 브라우저 PWA 로 모바일을 커버.
- 자체 백업 클라우드 운영 안 함. S3/R2 호환 버킷을 사용자/조직이 가져옴(BYO bucket).

## 1.4 한 문장 차별화 / One-line wedge

> 옵시디언의 손맛 + Claude Code 의 슬래시 명령 + Postgres 의 신뢰성 + pydantic-ai 의 타입 안전 멀티 에이전트, 4가지를 한 데스크톱 앱에 맞춘 첫 번째 제품.
