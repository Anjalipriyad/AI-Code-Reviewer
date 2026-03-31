"""
AI Code Reviewer — Review Routes (Controller Layer)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Endpoints:
  POST  /api/v1/analyze          — Submit code for AI analysis, persist results
  GET   /api/v1/history          — Paginated history of past reviews
  GET   /api/v1/history/{id}     — Single review detail
  PATCH /api/v1/history/{id}     — Dismiss / update a review
  GET   /api/v1/history/stats    — Aggregate review statistics
"""
from __future__ import annotations

import logging
import math
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import (
    FindingCategory,
    FindingSeverity,
    PullRequest,
    Repository,
    Review,
    ReviewStatus,
)
from app.schemas import (
    FixPatchRequest,
    PaginatedResponse,
    ReviewBrief,
    ReviewOut,
    ReviewStats,
    ReviewUpdate,
)
from app.services.ai_analyzer import AIAnalyzer, AnalysisReport

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["Reviews"])


# ╔══════════════════════════════════════════════════════════════╗
# ║                  Request / Response Schemas                  ║
# ╚══════════════════════════════════════════════════════════════╝

class AnalyzeRequest(BaseModel):
    """POST /analyze — request body."""
    code: str = Field(
        ...,
        min_length=1,
        max_length=500_000,
        description="Source code to analyze",
        examples=[
            "def login(user, pw):\n"
            "    query = f\"SELECT * FROM users WHERE name='{user}'\"\n"
            "    return db.execute(query)\n"
        ],
    )
    language: str = Field(
        "python",
        max_length=50,
        description="Programming language of the code",
        examples=["python", "javascript", "typescript"],
    )
    file_path: str = Field(
        "untitled",
        max_length=1024,
        description="File path for context (optional)",
        examples=["src/auth/login.py"],
    )
    repository_id: uuid.UUID | None = Field(
        None,
        description="Optional: link results to a repository",
    )
    pull_request_id: uuid.UUID | None = Field(
        None,
        description="Optional: link results to a pull request",
    )
    mode: str = Field(
        "full",
        pattern=r"^(full|quick)$",
        description="'full' = AST + LLM, 'quick' = AST only (no API cost)",
    )


class AnalyzeResponse(BaseModel):
    """POST /analyze — response body."""
    analysis: AnalysisReport
    reviews_saved: int = 0
    repository_id: uuid.UUID | None = None
    pull_request_id: uuid.UUID | None = None
    message: str = "Analysis complete"


# ╔══════════════════════════════════════════════════════════════╗
# ║                   POST /analyze                              ║
# ╚══════════════════════════════════════════════════════════════╝

@router.post(
    "/analyze",
    response_model=AnalyzeResponse,
    status_code=status.HTTP_200_OK,
    summary="Analyze code with AI",
    description=(
        "Submit source code for autonomous AI review. "
        "Returns syntax issues, security risks, time complexity, "
        "and refactor suggestions. Results are persisted to the DB "
        "when repository_id and pull_request_id are provided."
    ),
)
async def analyze_code(
    payload: AnalyzeRequest,
    db: AsyncSession = Depends(get_db),
) -> AnalyzeResponse:
    """
    Core endpoint — triggers the AI analysis pipeline and saves findings.

    Flow:
      1. Validate repository/PR exist (if IDs provided)
      2. Run AIAnalyzer (full or quick mode)
      3. Map findings → Review ORM objects
      4. Persist to DB
      5. Return structured report
    """
    analyzer = AIAnalyzer()
    repo_id = payload.repository_id
    pr_id = payload.pull_request_id

    # ── Validate linked entities ──────────────────────────────
    if repo_id:
        repo = await db.get(Repository, repo_id)
        if not repo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Repository {repo_id} not found",
            )

    if pr_id:
        pr = await db.get(PullRequest, pr_id)
        if not pr:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Pull request {pr_id} not found",
            )
        # Auto-set repo from PR if not explicitly provided
        if not repo_id:
            repo_id = pr.repository_id

        # Update PR review status
        pr.review_status = ReviewStatus.IN_PROGRESS
        db.add(pr)

    # ── Run analysis ──────────────────────────────────────────
    try:
        if payload.mode == "quick":
            report = await analyzer.analyze_quick(
                code=payload.code,
                language=payload.language,
            )
        else:
            report = await analyzer.analyze(
                code=payload.code,
                language=payload.language,
                file_path=payload.file_path,
            )
    except Exception as e:
        logger.error("Analysis pipeline failed: %s", e, exc_info=True)
        # Mark PR as failed if linked
        if pr_id:
            pr_obj = await db.get(PullRequest, pr_id)
            if pr_obj:
                pr_obj.review_status = ReviewStatus.FAILED
                db.add(pr_obj)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Analysis failed: {str(e)}",
        )

    # ── Persist findings to DB ────────────────────────────────
    reviews_saved = 0
    if repo_id and pr_id:
        reviews_saved = await _save_findings_to_db(
            db=db,
            report=report,
            repository_id=repo_id,
            pull_request_id=pr_id,
            file_path=payload.file_path,
        )

        # Mark PR as reviewed
        pr_obj = await db.get(PullRequest, pr_id)
        if pr_obj:
            pr_obj.review_status = ReviewStatus.COMPLETED
            pr_obj.reviewed_at = datetime.now(timezone.utc)
            db.add(pr_obj)

        logger.info(
            "Saved %d review findings for repo=%s pr=%s",
            reviews_saved, repo_id, pr_id,
        )

    return AnalyzeResponse(
        analysis=report,
        reviews_saved=reviews_saved,
        repository_id=repo_id,
        pull_request_id=pr_id,
        message=(
            f"Analysis complete. {reviews_saved} findings saved."
            if reviews_saved
            else "Analysis complete (results not persisted — "
            "provide repository_id and pull_request_id to save)."
        ),
    )


# ╔══════════════════════════════════════════════════════════════╗
# ║                   GET /history                               ║
# ╚══════════════════════════════════════════════════════════════╝

@router.get(
    "/history",
    response_model=PaginatedResponse,
    summary="Fetch past review history",
    description=(
        "Paginated list of all past review findings with optional "
        "filters by severity, category, repository, and dismissal status."
    ),
)
async def get_review_history(
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    severity: FindingSeverity | None = Query(
        None, description="Filter by severity"
    ),
    category: FindingCategory | None = Query(
        None, description="Filter by category"
    ),
    repository_id: uuid.UUID | None = Query(
        None, description="Filter by repository"
    ),
    pull_request_id: uuid.UUID | None = Query(
        None, description="Filter by pull request"
    ),
    is_dismissed: bool | None = Query(
        None, description="Filter by dismissal status"
    ),
    detected_by: str | None = Query(
        None, description="Filter by detector: langchain, ast, combined"
    ),
    sort_by: str = Query(
        "created_at",
        pattern=r"^(created_at|severity|confidence_score|file_path)$",
        description="Sort field",
    ),
    sort_order: str = Query(
        "desc",
        pattern=r"^(asc|desc)$",
        description="Sort direction",
    ),
) -> PaginatedResponse:
    """
    Query the review history with filtering, sorting, and pagination.
    """
    # ── Build base query ──────────────────────────────────────
    query = select(Review)

    if severity:
        query = query.where(Review.severity == severity)
    if category:
        query = query.where(Review.category == category)
    if repository_id:
        query = query.where(Review.repository_id == repository_id)
    if pull_request_id:
        query = query.where(Review.pull_request_id == pull_request_id)
    if is_dismissed is not None:
        query = query.where(Review.is_dismissed == is_dismissed)
    if detected_by:
        query = query.where(Review.detected_by == detected_by)

    # ── Count total ───────────────────────────────────────────
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    total_pages = math.ceil(total / page_size) if total else 0

    # ── Sort ──────────────────────────────────────────────────
    sort_column = getattr(Review, sort_by, Review.created_at)
    if sort_order == "desc":
        query = query.order_by(sort_column.desc())
    else:
        query = query.order_by(sort_column.asc())

    # ── Paginate ──────────────────────────────────────────────
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await db.execute(query)
    reviews = result.scalars().all()

    return PaginatedResponse(
        items=[ReviewBrief.model_validate(r) for r in reviews],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


# ╔══════════════════════════════════════════════════════════════╗
# ║                GET /history/stats                            ║
# ╚══════════════════════════════════════════════════════════════╝

@router.get(
    "/history/stats",
    response_model=ReviewStats,
    summary="Aggregate review statistics",
    description="Dashboard-ready aggregate stats across all reviews.",
)
async def get_review_stats(
    db: AsyncSession = Depends(get_db),
    repository_id: uuid.UUID | None = Query(
        None, description="Scope stats to a specific repository"
    ),
) -> ReviewStats:
    """
    Returns aggregate counts by severity, category breakdown,
    and average confidence score.
    """
    base = select(Review)
    if repository_id:
        base = base.where(Review.repository_id == repository_id)

    # ── Total + dismissed count ───────────────────────────────
    total_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(total_q)).scalar() or 0

    dismissed_q = select(func.count()).select_from(
        base.where(Review.is_dismissed.is_(True)).subquery()
    )
    dismissed = (await db.execute(dismissed_q)).scalar() or 0

    # ── Severity breakdown ────────────────────────────────────
    severity_counts: dict[str, int] = {}
    for sev in FindingSeverity:
        sev_q = select(func.count()).select_from(
            base.where(Review.severity == sev).subquery()
        )
        count = (await db.execute(sev_q)).scalar() or 0
        severity_counts[sev.value] = count

    # ── Category breakdown ────────────────────────────────────
    category_breakdown: dict[str, int] = {}
    for cat in FindingCategory:
        cat_q = select(func.count()).select_from(
            base.where(Review.category == cat).subquery()
        )
        count = (await db.execute(cat_q)).scalar() or 0
        if count > 0:
            category_breakdown[cat.value] = count

    # ── Average confidence ────────────────────────────────────
    avg_q = select(func.avg(Review.confidence_score)).select_from(
        base.subquery()
    )
    avg_conf = (await db.execute(avg_q)).scalar() or 0.0

    return ReviewStats(
        total_reviews=total,
        critical=severity_counts.get("critical", 0),
        high=severity_counts.get("high", 0),
        medium=severity_counts.get("medium", 0),
        low=severity_counts.get("low", 0),
        info=severity_counts.get("info", 0),
        dismissed=dismissed,
        avg_confidence=round(float(avg_conf), 3),
        category_breakdown=category_breakdown,
    )


# ╔══════════════════════════════════════════════════════════════╗
# ║                GET /history/{review_id}                      ║
# ╚══════════════════════════════════════════════════════════════╝

@router.get(
    "/history/{review_id}",
    response_model=ReviewOut,
    summary="Get a single review finding",
)
async def get_review_detail(
    review_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> ReviewOut:
    """Fetch full details of a single review finding by ID."""
    review = await db.get(Review, review_id)
    if not review:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Review {review_id} not found",
        )
    return ReviewOut.model_validate(review)


# ╔══════════════════════════════════════════════════════════════╗
# ║              PATCH /history/{review_id}                      ║
# ╚══════════════════════════════════════════════════════════════╝

@router.patch(
    "/history/{review_id}",
    response_model=ReviewOut,
    summary="Update or dismiss a review finding",
)
async def update_review(
    review_id: uuid.UUID,
    payload: ReviewUpdate,
    db: AsyncSession = Depends(get_db),
) -> ReviewOut:
    """
    Dismiss a review finding or override its severity.
    Used by human reviewers to triage AI findings.
    """
    review = await db.get(Review, review_id)
    if not review:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Review {review_id} not found",
        )

    update_data = payload.model_dump(exclude_unset=True)
    for field_name, value in update_data.items():
        setattr(review, field_name, value)

    db.add(review)
    await db.flush()
    await db.refresh(review)

    logger.info("Updated review %s: %s", review_id, update_data)
    return ReviewOut.model_validate(review)


# ╔══════════════════════════════════════════════════════════════╗
# ║                   POST /fix                                  ║
# ╚══════════════════════════════════════════════════════════════╝

@router.post(
    "/fix",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    summary="Generate a git patch to fix a finding",
    description=(
        "Uses the AI to generate a unified diff (git patch) that fixes "
        "a specific code issue. The user can copy-paste and apply it "
        "via `git apply`."
    ),
)
async def generate_fix_patch(
    payload: FixPatchRequest,
) -> dict:
    """
    Generate a unified diff patch for a specific finding.

    Flow:
      1. Receive the code + finding details
      2. Call AIAnalyzer.generate_fix_patch (LLM)
      3. Return the unified diff string
    """
    analyzer = AIAnalyzer()

    try:
        patch = await analyzer.generate_fix_patch(
            code=payload.code,
            language=payload.language,
            file_path=payload.file_path,
            finding_title=payload.finding_title,
            finding_description=payload.finding_description,
            line_start=payload.line_start,
            line_end=payload.line_end,
            suggested_fix=payload.suggested_fix,
        )
    except Exception as e:
        logger.error("Fix patch generation failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Patch generation failed: {str(e)}",
        )

    return {
        "patch": patch,
        "file_path": payload.file_path,
        "success": bool(patch and not patch.startswith("# Error")),
    }


# ╔══════════════════════════════════════════════════════════════╗
# ║             GET /complexity-heatmap                          ║
# ╚══════════════════════════════════════════════════════════════╝

@router.get(
    "/complexity-heatmap",
    response_model=dict,
    summary="File-level technical debt heatmap",
    description=(
        "Aggregates review findings per file to produce a heatmap "
        "showing which files carry the most technical debt."
    ),
)
async def get_complexity_heatmap(
    db: AsyncSession = Depends(get_db),
    repository_id: uuid.UUID | None = Query(
        None, description="Scope to a specific repository"
    ),
) -> dict:
    """
    Returns per-file aggregated finding counts, grouped by severity
    and category, for the complexity heatmap visualization.
    """
    base = select(Review).where(Review.is_dismissed.is_(False))
    if repository_id:
        base = base.where(Review.repository_id == repository_id)

    result = await db.execute(base)
    reviews = result.scalars().all()

    # Aggregate per file
    file_map: dict[str, dict] = {}
    severity_order = ["critical", "high", "medium", "low", "info"]

    for r in reviews:
        fp = r.file_path
        if fp not in file_map:
            file_map[fp] = {
                "file_path": fp,
                "total_findings": 0,
                "critical": 0,
                "high": 0,
                "medium": 0,
                "low": 0,
                "info": 0,
                "worst_severity": "info",
                "categories": {},
            }

        entry = file_map[fp]
        entry["total_findings"] += 1

        sev = r.severity.value
        if sev in entry:
            entry[sev] += 1

        # Track worst severity
        current_worst = severity_order.index(entry["worst_severity"])
        new_sev = severity_order.index(sev) if sev in severity_order else 4
        if new_sev < current_worst:
            entry["worst_severity"] = sev

        # Category breakdown
        cat = r.category.value
        entry["categories"][cat] = entry["categories"].get(cat, 0) + 1

    files = sorted(
        file_map.values(),
        key=lambda x: x["total_findings"],
        reverse=True,
    )

    return {
        "files": files,
        "total_files": len(files),
        "total_findings": sum(f["total_findings"] for f in files),
    }


# ╔══════════════════════════════════════════════════════════════╗
# ║                   Helper: Save Findings                      ║
# ╚══════════════════════════════════════════════════════════════╝

_SEVERITY_MAP = {
    "critical": FindingSeverity.CRITICAL,
    "high": FindingSeverity.HIGH,
    "medium": FindingSeverity.MEDIUM,
    "low": FindingSeverity.LOW,
    "info": FindingSeverity.INFO,
    "error": FindingSeverity.HIGH,
    "warning": FindingSeverity.MEDIUM,
}

_CATEGORY_MAP = {
    "sqli": FindingCategory.SECURITY,
    "xss": FindingCategory.SECURITY,
    "path_traversal": FindingCategory.SECURITY,
    "command_injection": FindingCategory.SECURITY,
    "hardcoded_secret": FindingCategory.SECURITY,
    "insecure_deserialization": FindingCategory.SECURITY,
    "ssrf": FindingCategory.SECURITY,
    "open_redirect": FindingCategory.SECURITY,
    "dangerous_function": FindingCategory.SECURITY,
    "dry_violation": FindingCategory.CODE_SMELL,
    "naming": FindingCategory.STYLE,
    "design_pattern": FindingCategory.BEST_PRACTICE,
    "simplification": FindingCategory.CODE_SMELL,
    "error_handling": FindingCategory.BUG_RISK,
    "type_safety": FindingCategory.BUG_RISK,
    "documentation": FindingCategory.STYLE,
}


async def _save_findings_to_db(
    db: AsyncSession,
    report: AnalysisReport,
    repository_id: uuid.UUID,
    pull_request_id: uuid.UUID,
    file_path: str,
) -> int:
    """
    Map AnalysisReport findings → Review ORM rows and batch-save.

    Returns the number of reviews persisted.
    """
    reviews: list[Review] = []

    # ── Security risks → Reviews ──────────────────────────────
    for risk in report.security_risks:
        reviews.append(Review(
            repository_id=repository_id,
            pull_request_id=pull_request_id,
            file_path=file_path,
            line_start=risk.line,
            line_end=None,
            severity=_SEVERITY_MAP.get(risk.severity, FindingSeverity.MEDIUM),
            category=_CATEGORY_MAP.get(risk.type, FindingCategory.SECURITY),
            rule_id=risk.cwe_id,
            title=f"[{risk.type.upper()}] {risk.description[:100]}",
            description=risk.description,
            suggested_fix=risk.remediation,
            code_snippet=None,
            confidence_score=0.85,
            detected_by="ast" if risk.cwe_id else "langchain",
        ))

    # ── Syntax issues → Reviews ───────────────────────────────
    for issue in report.syntax_issues:
        reviews.append(Review(
            repository_id=repository_id,
            pull_request_id=pull_request_id,
            file_path=file_path,
            line_start=issue.line,
            line_end=None,
            severity=_SEVERITY_MAP.get(issue.severity, FindingSeverity.MEDIUM),
            category=FindingCategory.BUG_RISK,
            rule_id=None,
            title=f"[SYNTAX] {issue.message[:100]}",
            description=issue.message,
            suggested_fix=None,
            code_snippet=issue.code_snippet,
            confidence_score=1.0,  # Deterministic finding
            detected_by="ast",
        ))

    # ── Complexity issues → Reviews (only O(n²) or worse) ─────
    for comp in report.time_complexity:
        if comp.time_complexity not in ("O(1)", "O(n)", "O(log n)"):
            reviews.append(Review(
                repository_id=repository_id,
                pull_request_id=pull_request_id,
                file_path=file_path,
                line_start=comp.line,
                line_end=None,
                severity=FindingSeverity.MEDIUM,
                category=FindingCategory.PERFORMANCE,
                rule_id=None,
                title=(
                    f"[COMPLEXITY] `{comp.function_name}()` "
                    f"is {comp.time_complexity}"
                ),
                description=(
                    f"Function `{comp.function_name}` has time complexity "
                    f"{comp.time_complexity}. {comp.reasoning}"
                ),
                suggested_fix=None,
                code_snippet=None,
                confidence_score=0.7,
                detected_by="combined",
            ))

    # ── Refactor suggestions → Reviews ────────────────────────
    for refactor in report.refactor_suggestions:
        reviews.append(Review(
            repository_id=repository_id,
            pull_request_id=pull_request_id,
            file_path=file_path,
            line_start=refactor.line_start,
            line_end=refactor.line_end,
            severity=_SEVERITY_MAP.get(refactor.priority, FindingSeverity.LOW),
            category=_CATEGORY_MAP.get(
                refactor.category, FindingCategory.CODE_SMELL
            ),
            rule_id=None,
            title=f"[REFACTOR] {refactor.title}",
            description=refactor.description,
            suggested_fix=refactor.suggested_code,
            code_snippet=None,
            confidence_score=0.6,
            detected_by="langchain",
        ))

    # ── Batch insert ──────────────────────────────────────────
    if reviews:
        db.add_all(reviews)
        await db.flush()
        logger.info("Batch-inserted %d review findings", len(reviews))

    return len(reviews)
