"""Golden eval gate for IngestAgent S-09a behavior."""

from dataclasses import dataclass

from weki_agents.ingest import IngestRequest, create_ingest_patch
from weki_agents.models import IngestCreateDocOp

INGEST_EVAL_THRESHOLD = 0.8


@dataclass(frozen=True)
class IngestEvalCase:
    id: str
    request: IngestRequest
    raw_id: str
    min_docs: int
    max_docs: int


@dataclass(frozen=True)
class IngestEvalResult:
    score: float
    passed: bool
    case_scores: dict[str, float]
    raw_count: int
    average_fan_out: float
    single_node_ratio: float


RAW_FIXTURES = [
    (
        "ingest-policy-md",
        "raw-onboarding",
        "file://./inbox/onboarding.md",
        "text/markdown",
        "Onboarding policy defines approvals. The checklist covers security, tools, and manager review.",
    ),
    (
        "ingest-url",
        "raw-url",
        "https://example.com/wiki",
        "text/html",
        "LLM wiki systems compound through ingest, ask, and curation loops. Search and links preserve reusable context.",
    ),
    (
        "ingest-arxiv-pdf",
        "raw-arxiv",
        "file://./inbox/llm-wiki.pdf",
        "application/pdf",
        "The paper introduces retrieval augmented wiki maintenance. Concepts include raw source provenance, entity extraction, and knowledge graph links.",
    ),
    (
        "ingest-syllabus",
        "raw-syllabus",
        "file://./inbox/syllabus.pdf",
        "application/pdf",
        "The syllabus describes weekly lectures, grading policy, project checkpoints, office hours, and student collaboration rules.",
    ),
    (
        "ingest-image-ocr",
        "raw-image",
        "file://./inbox/whiteboard.png",
        "image/png",
        "OCR text from whiteboard: roadmap milestones, product risks, customer interviews, onboarding funnel, and retention metrics.",
    ),
    (
        "ingest-audio-notes",
        "raw-audio",
        "file://./inbox/founder-call.md",
        "text/markdown",
        "Founder call notes mention enterprise buyer concerns, compliance review, policy import, data residency, and admin approval.",
    ),
    (
        "ingest-korean-policy",
        "raw-korean-policy",
        "file://./inbox/보안-정책.md",
        "text/markdown",
        "보안 정책은 계정 승인 절차와 장비 등록 기준을 설명합니다. 관리자 검토와 감사 로그가 필요합니다.",
    ),
    (
        "ingest-japanese-research",
        "raw-japanese",
        "file://./inbox/research-ja.md",
        "text/markdown",
        "研究ノートはナレッジグラフ、検索、要約ページ、概念ノード、エンティティ抽出について説明します。",
    ),
    (
        "ingest-conference-talk",
        "raw-talk",
        "https://example.com/talk",
        "text/html",
        "Conference talk highlights agent evaluation, structured outputs, cost telemetry, latency budgets, and rollback safety.",
    ),
    (
        "ingest-product-brief",
        "raw-product-brief",
        "file://./inbox/product-brief.md",
        "text/markdown",
        "Product brief covers personas, startup workflows, draft commands, improve options, ask answers, and compounding documentation.",
    ),
    (
        "ingest-hr-faq",
        "raw-hr-faq",
        "file://./inbox/hr-faq.md",
        "text/markdown",
        "HR FAQ explains leave benefits, payroll schedule, onboarding checklist, manager approval, and employee self service.",
    ),
    (
        "ingest-security-audit",
        "raw-security-audit",
        "file://./inbox/security-audit.pdf",
        "application/pdf",
        "Security audit findings include secret masking, row level security, patch approvals, audit log coverage, and incident response.",
    ),
    (
        "ingest-lesson-plan",
        "raw-lesson-plan",
        "file://./inbox/lesson-plan.md",
        "text/markdown",
        "Lesson plan introduces graph traversal, semantic search, assignments, rubric criteria, student questions, and weekly reviews.",
    ),
    (
        "ingest-customer-interview",
        "raw-interview",
        "file://./inbox/customer-interview.md",
        "text/markdown",
        "Customer interview mentions Notion migration, Confluence export, import fidelity, broken links, and policy ownership.",
    ),
    (
        "ingest-release-notes",
        "raw-release-notes",
        "file://./inbox/release-notes.md",
        "text/markdown",
        "Release notes describe desktop shell, provider preflight, Gemini default model, approval queue, and workspace sync.",
    ),
    (
        "ingest-design-doc",
        "raw-design-doc",
        "file://./inbox/design-doc.md",
        "text/markdown",
        "Design document covers editor layout, slash menu, keyboard flow, preview panel, status messages, and localization keys.",
    ),
    (
        "ingest-architecture",
        "raw-architecture",
        "file://./inbox/architecture.md",
        "text/markdown",
        "Architecture note describes agent server daemon, Python workers, Postgres source of truth, Tauri shell, and Next web mirror.",
    ),
    (
        "ingest-data-model",
        "raw-data-model",
        "file://./inbox/data-model.md",
        "text/markdown",
        "Data model note explains raw sources, import runs, documents, links, doc versions, patches, and audit log tables.",
    ),
    (
        "ingest-risk-register",
        "raw-risks",
        "file://./inbox/risks.md",
        "text/markdown",
        "Risk register tracks LLM cost, user migration, over curation, provider latency, data sovereignty, and acceptance gates.",
    ),
    (
        "ingest-budget",
        "raw-budget",
        "file://./inbox/budget.md",
        "text/markdown",
        "Budget memo lists token cost, model routing, embedding batches, eval runs, telemetry retention, and dashboard alerts.",
    ),
    (
        "ingest-meeting",
        "raw-meeting",
        "file://./inbox/meeting.md",
        "text/markdown",
        "Meeting notes capture decisions about import approval, rollback command, markdown fidelity, docx tables, and numbering preservation.",
    ),
    (
        "ingest-runbook",
        "raw-runbook",
        "file://./inbox/runbook.md",
        "text/markdown",
        "Runbook documents incident severity, on call rotation, escalation contacts, recovery procedure, and audit requirements.",
    ),
    (
        "ingest-legal",
        "raw-legal",
        "file://./inbox/legal.md",
        "text/markdown",
        "Legal memo discusses data processing agreement, retention terms, export rights, compliance audit, and vendor review.",
    ),
    (
        "ingest-sales-call",
        "raw-sales-call",
        "file://./inbox/sales-call.md",
        "text/markdown",
        "Sales call notes include procurement blockers, import demo, executive sponsor, security questionnaire, and pilot timeline.",
    ),
    (
        "ingest-api-doc",
        "raw-api-doc",
        "file://./inbox/api-doc.md",
        "text/markdown",
        "API document describes HTTP routes, SSE events, patch decisions, tool calls, workspace identity, and error responses.",
    ),
    (
        "ingest-ops-review",
        "raw-ops-review",
        "file://./inbox/ops-review.md",
        "text/markdown",
        "Operations review covers backup checks, Postgres vacuum, index maintenance, pgvector migration, and disaster recovery.",
    ),
    (
        "ingest-research-digest",
        "raw-digest",
        "https://example.com/digest",
        "text/html",
        "Research digest covers retrieval benchmarks, fuzzy search, semantic rank fusion, citation quality, and human evaluation.",
    ),
    (
        "ingest-training",
        "raw-training",
        "file://./inbox/training.md",
        "text/markdown",
        "Training guide explains student onboarding, instructor curation, weekly imports, question answering, and final graph review.",
    ),
    (
        "ingest-support-ticket",
        "raw-ticket",
        "file://./inbox/support-ticket.md",
        "text/markdown",
        "Support ticket reports failed import, duplicate path conflict, partial status, rollback request, and broken link report.",
    ),
    (
        "ingest-localization",
        "raw-localization",
        "file://./inbox/localization.md",
        "text/markdown",
        "Localization note lists Korean labels, English labels, slash command summaries, error messages, and desktop status text.",
    ),
]

GOLDEN_CASES = [
    IngestEvalCase(
        id=case_id,
        request=IngestRequest(
            input=f"/ingest {'url' if uri.startswith('http') else 'path'}:{uri.replace('file://', '')}",
            context={
                "rawSource": {
                    "rawId": raw_id,
                    "uri": uri,
                    "mime": mime,
                    "sha256": f"{index:064x}",
                    "bytes": len(text.encode("utf-8")),
                    "text": text,
                }
            },
        ),
        raw_id=raw_id,
        min_docs=3,
        max_docs=10,
    )
    for index, (case_id, raw_id, uri, mime, text) in enumerate(RAW_FIXTURES, start=1)
]


def evaluate_ingest_agent() -> IngestEvalResult:
    case_scores = {case.id: _score_case(case) for case in GOLDEN_CASES}
    fan_outs = [_fan_out(case) for case in GOLDEN_CASES]
    score = sum(case_scores.values()) / len(case_scores)
    average_fan_out = sum(fan_outs) / len(fan_outs)
    single_node_ratio = sum(1 for fan_out in fan_outs if fan_out <= 1) / len(fan_outs)
    passed = (
        score >= INGEST_EVAL_THRESHOLD
        and len(GOLDEN_CASES) >= 30
        and 3 <= average_fan_out <= 10
        and single_node_ratio <= 0.2
    )
    return IngestEvalResult(
        score=score,
        passed=passed,
        case_scores=case_scores,
        raw_count=len(GOLDEN_CASES),
        average_fan_out=average_fan_out,
        single_node_ratio=single_node_ratio,
    )


def _score_case(case: IngestEvalCase) -> float:
    patch = create_ingest_patch(case.request)
    create_docs = [op for op in patch.ops if isinstance(op, IngestCreateDocOp)]
    schema_score = 1.0 if patch.output_schema == "IngestPatch" and patch.kind == "Patch" else 0.0
    fanout_score = 1.0 if case.min_docs <= len(create_docs) <= case.max_docs else 0.0
    summary_score = 1.0 if any(op.doc_kind == "summary" for op in create_docs) else 0.0
    provenance_score = 1.0 if all(case.raw_id in op.frontmatter.sources for op in create_docs) else 0.0
    log_score = 1.0 if any(op.kind == "append_log" for op in patch.ops) else 0.0
    return (schema_score + fanout_score + summary_score + provenance_score + log_score) / 5


def _fan_out(case: IngestEvalCase) -> int:
    patch = create_ingest_patch(case.request)
    return len([op for op in patch.ops if isinstance(op, IngestCreateDocOp)])
