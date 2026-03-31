"""
AI Code Reviewer — Pydantic Schemas (Request / Response Validation)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Strict separation between:
  • *Create  — request body for creating a resource
  • *Update  — request body for partial updates (all fields optional)
  • *Out     — response body returned to the client (read-only fields + from_attributes)
  • *Brief   — lightweight summary for list endpoints (avoids over-fetching)
"""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, HttpUrl

from app.models import (
    FindingCategory,
    FindingSeverity,
    GitProvider,
    PRStatus,
    ReviewStatus,
    UserRole,
)


# ╔══════════════════════════════════════════════════════════════╗
# ║                        Base Config                           ║
# ╚══════════════════════════════════════════════════════════════╝

class _ORMBase(BaseModel):
    """Shared config for all schemas that map to ORM models."""
    model_config = ConfigDict(from_attributes=True)


# ╔══════════════════════════════════════════════════════════════╗
# ║                      User Schemas                            ║
# ╚══════════════════════════════════════════════════════════════╝

class UserCreate(BaseModel):
    """POST /users — registration payload."""
    email: EmailStr
    username: str = Field(
        ..., min_length=3, max_length=100,
        pattern=r"^[a-zA-Z0-9_-]+$",
        examples=["john_doe"],
    )
    password: str = Field(
        ..., min_length=8, max_length=128,
        examples=["S3cur3P@ssw0rd!"],
    )
    full_name: str | None = Field(None, max_length=255)


class UserUpdate(BaseModel):
    """PATCH /users/{id} — partial profile update."""
    full_name: str | None = Field(None, max_length=255)
    avatar_url: HttpUrl | None = None
    role: UserRole | None = None


class UserOut(_ORMBase):
    """Response schema for user data (never exposes password or tokens)."""
    id: uuid.UUID
    email: EmailStr
    username: str
    full_name: str | None
    avatar_url: str | None
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime


class UserBrief(_ORMBase):
    """Lightweight user reference for nested responses."""
    id: uuid.UUID
    username: str
    avatar_url: str | None


# ╔══════════════════════════════════════════════════════════════╗
# ║                   Repository Schemas                         ║
# ╚══════════════════════════════════════════════════════════════╝

class RepositoryCreate(BaseModel):
    """POST /repositories — connect a new repo."""
    name: str = Field(
        ..., min_length=1, max_length=255,
        examples=["my-project"],
    )
    full_name: str = Field(
        ..., min_length=1, max_length=512,
        examples=["octocat/my-project"],
    )
    clone_url: HttpUrl = Field(
        ..., examples=["https://github.com/octocat/my-project.git"],
    )
    default_branch: str = Field("main", max_length=255)
    provider: GitProvider = GitProvider.GITHUB
    language: str | None = Field(None, max_length=100)
    settings: dict | None = None


class RepositoryUpdate(BaseModel):
    """PATCH /repositories/{id} — update repo settings."""
    default_branch: str | None = Field(None, max_length=255)
    is_active: bool | None = None
    language: str | None = Field(None, max_length=100)
    settings: dict | None = None


class RepositoryOut(_ORMBase):
    """Full repository response with nested review summary."""
    id: uuid.UUID
    owner_id: uuid.UUID
    name: str
    full_name: str
    clone_url: str
    default_branch: str
    provider: GitProvider
    language: str | None
    is_active: bool
    settings: dict | None
    last_synced_at: datetime | None
    created_at: datetime
    updated_at: datetime

    # Nested counts (populated by service layer)
    total_pull_requests: int = 0
    total_reviews: int = 0


class RepositoryBrief(_ORMBase):
    """Lightweight repo reference for list views."""
    id: uuid.UUID
    name: str
    full_name: str
    provider: GitProvider
    language: str | None
    is_active: bool


class RepositoryWithReviews(_ORMBase):
    """Repository response with its reviews eagerly loaded."""
    id: uuid.UUID
    name: str
    full_name: str
    provider: GitProvider
    language: str | None
    is_active: bool
    reviews: list[ReviewOut] = []  # Forward ref resolved below


# ╔══════════════════════════════════════════════════════════════╗
# ║                  Pull Request Schemas                        ║
# ╚══════════════════════════════════════════════════════════════╝

class PullRequestCreate(BaseModel):
    """POST /pull-requests — register a PR (usually via webhook)."""
    repository_id: uuid.UUID
    pr_number: int = Field(..., gt=0)
    title: str = Field(..., min_length=1, max_length=1024)
    author: str = Field(..., max_length=255)
    source_branch: str = Field(..., max_length=255)
    target_branch: str = Field(..., max_length=255)
    head_sha: str = Field(
        ..., min_length=40, max_length=40,
        pattern=r"^[a-f0-9]{40}$",
        examples=["a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"],
    )
    diff_content: str | None = None


class PullRequestUpdate(BaseModel):
    """PATCH /pull-requests/{id} — update PR state."""
    title: str | None = Field(None, max_length=1024)
    status: PRStatus | None = None
    review_status: ReviewStatus | None = None
    diff_content: str | None = None


class PullRequestOut(_ORMBase):
    """Full pull request response."""
    id: uuid.UUID
    repository_id: uuid.UUID
    pr_number: int
    title: str
    author: str
    source_branch: str
    target_branch: str
    status: PRStatus
    head_sha: str
    review_status: ReviewStatus
    reviewed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    # Nested
    review_count: int = 0


class PullRequestBrief(_ORMBase):
    """Lightweight PR summary for list views."""
    id: uuid.UUID
    pr_number: int
    title: str
    author: str
    status: PRStatus
    review_status: ReviewStatus


class PullRequestWithReviews(_ORMBase):
    """PR response with all review findings eagerly loaded."""
    id: uuid.UUID
    repository_id: uuid.UUID
    pr_number: int
    title: str
    author: str
    source_branch: str
    target_branch: str
    status: PRStatus
    head_sha: str
    review_status: ReviewStatus
    reviewed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    reviews: list[ReviewOut] = []  # Forward ref resolved below


# ╔══════════════════════════════════════════════════════════════╗
# ║                     Review Schemas                           ║
# ╚══════════════════════════════════════════════════════════════╝

class ReviewCreate(BaseModel):
    """
    POST /reviews — create a review finding.

    Typically called internally by the AI pipeline, not by end users.
    """
    repository_id: uuid.UUID
    pull_request_id: uuid.UUID
    file_path: str = Field(..., max_length=1024)
    line_start: int = Field(..., ge=1)
    line_end: int | None = Field(None, ge=1)
    severity: FindingSeverity
    category: FindingCategory
    rule_id: str | None = Field(None, max_length=255)
    title: str = Field(..., min_length=1)
    description: str = Field(..., min_length=1)
    suggested_fix: str | None = None
    code_snippet: str | None = None
    confidence_score: float = Field(0.0, ge=0.0, le=1.0)
    detected_by: str = Field("langchain", max_length=100)


class ReviewUpdate(BaseModel):
    """PATCH /reviews/{id} — dismiss or update a finding."""
    is_dismissed: bool | None = None
    dismissed_by: str | None = Field(None, max_length=255)
    dismissed_reason: str | None = None
    severity: FindingSeverity | None = None  # Allow human override


class ReviewOut(_ORMBase):
    """Full review finding response."""
    id: uuid.UUID
    repository_id: uuid.UUID
    pull_request_id: uuid.UUID
    file_path: str
    line_start: int
    line_end: int | None
    severity: FindingSeverity
    category: FindingCategory
    rule_id: str | None
    title: str
    description: str
    suggested_fix: str | None
    code_snippet: str | None
    confidence_score: float
    detected_by: str
    is_dismissed: bool
    dismissed_by: str | None
    dismissed_reason: str | None
    created_at: datetime


class ReviewBrief(_ORMBase):
    """Lightweight review summary for list/table views."""
    id: uuid.UUID
    file_path: str
    line_start: int
    severity: FindingSeverity
    category: FindingCategory
    title: str
    confidence_score: float
    is_dismissed: bool


# ╔══════════════════════════════════════════════════════════════╗
# ║                   Fix-it / Generation Schemas                ║
# ╚══════════════════════════════════════════════════════════════╝

class FixPatchRequest(BaseModel):
    """POST /fix — request a unified git diff for a finding."""
    code: str
    language: str
    file_path: str
    finding_title: str
    finding_description: str
    line_start: int
    line_end: int | None = None
    suggested_fix: str | None = None


class FixPatchResponse(BaseModel):
    """POST /fix — returned unified diff patch."""
    patch: str
    file_path: str
    success: bool = True


# ╔══════════════════════════════════════════════════════════════╗
# ║               Aggregation / Stats Schemas                    ║
# ╚══════════════════════════════════════════════════════════════╝

class ReviewStats(BaseModel):
    """Aggregate review statistics (for dashboard cards)."""
    total_reviews: int = 0
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    info: int = 0
    dismissed: int = 0
    avg_confidence: float = 0.0

    category_breakdown: dict[str, int] = Field(
        default_factory=dict,
        examples=[{"security": 5, "performance": 3, "bug_risk": 12}],
    )


class FileDebtEntry(BaseModel):
    """Stats per file for the complexity heatmap."""
    file_path: str
    total_findings: int = 0
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    info: int = 0
    worst_severity: str = "info"
    categories: dict[str, int] = Field(default_factory=dict)


class ComplexityHeatmapResponse(BaseModel):
    """GET /complexity-heatmap response."""
    files: list[FileDebtEntry] = []
    total_files: int = 0
    total_findings: int = 0


class HealthCheck(BaseModel):
    """GET /health response."""
    status: str = "healthy"
    service: str = "ai-code-reviewer"
    version: str = "0.1.0"


# ╔══════════════════════════════════════════════════════════════╗
# ║             Pagination (Generic Wrapper)                     ║
# ╚══════════════════════════════════════════════════════════════╝

class PaginatedResponse(BaseModel):
    """Generic paginated list response."""
    items: list = []
    total: int = 0
    page: int = 1
    page_size: int = 20
    total_pages: int = 0


# ╔══════════════════════════════════════════════════════════════╗
# ║               Auth Schemas                                   ║
# ╚══════════════════════════════════════════════════════════════╝

class Token(BaseModel):
    """JWT token response after login."""
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class TokenPayload(BaseModel):
    """Decoded JWT payload."""
    sub: uuid.UUID          # user id
    role: UserRole
    exp: datetime


class LoginRequest(BaseModel):
    """POST /auth/login — credentials payload."""
    email: EmailStr
    password: str = Field(..., min_length=8)


# ╔══════════════════════════════════════════════════════════════╗
# ║         Resolve Forward References                           ║
# ╚══════════════════════════════════════════════════════════════╝

# These models reference ReviewOut before it's defined,
# so we rebuild them after all classes exist.
RepositoryWithReviews.model_rebuild()
PullRequestWithReviews.model_rebuild()
