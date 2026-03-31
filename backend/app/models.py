"""
AI Code Reviewer — SQLAlchemy ORM Models
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Domain models for the code review platform.

Relationships:
  User  ──1:N──▶  Repository
  Repository  ──1:N──▶  PullRequest
  Repository  ──1:N──▶  Review        (direct: all reviews for a repo)
  PullRequest ──1:N──▶  Review        (scoped: reviews for a specific PR)
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UUID,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


# ╔══════════════════════════════════════════════════════════════╗
# ║                         Enums                                ║
# ╚══════════════════════════════════════════════════════════════╝

class UserRole(str, enum.Enum):
    """Access level within the platform."""
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


class GitProvider(str, enum.Enum):
    """Supported Git hosting providers."""
    GITHUB = "github"
    GITLAB = "gitlab"
    BITBUCKET = "bitbucket"


class PRStatus(str, enum.Enum):
    """Lifecycle state of a pull request."""
    OPEN = "open"
    CLOSED = "closed"
    MERGED = "merged"


class ReviewStatus(str, enum.Enum):
    """State of the AI review pipeline for a PR."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


class FindingSeverity(str, enum.Enum):
    """Impact level of a review finding."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class FindingCategory(str, enum.Enum):
    """Classification of what the finding relates to."""
    SECURITY = "security"
    PERFORMANCE = "performance"
    BUG_RISK = "bug_risk"
    CODE_SMELL = "code_smell"
    STYLE = "style"
    COMPLEXITY = "complexity"
    BEST_PRACTICE = "best_practice"


# ╔══════════════════════════════════════════════════════════════╗
# ║                       Mixins                                 ║
# ╚══════════════════════════════════════════════════════════════╝

class TimestampMixin:
    """Adds created_at / updated_at audit columns."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class UUIDPrimaryKeyMixin:
    """Adds a UUID v4 primary key."""

    id: Mapped[uuid.UUID] = mapped_column(
        UUID,
        primary_key=True,
        default=uuid.uuid4,
    )


# ╔══════════════════════════════════════════════════════════════╗
# ║                      User Model                              ║
# ╚══════════════════════════════════════════════════════════════╝

class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    Platform user account.

    Supports both email/password and GitHub OAuth authentication.
    A user can own multiple repositories.
    """
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(
        String(320), unique=True, index=True, nullable=False,
    )
    username: Mapped[str] = mapped_column(
        String(100), unique=True, index=True, nullable=False,
    )
    hashed_password: Mapped[str | None] = mapped_column(
        String(1024), nullable=True,  # Null when using OAuth-only flow
    )
    full_name: Mapped[str | None] = mapped_column(
        String(255), nullable=True,
    )
    avatar_url: Mapped[str | None] = mapped_column(
        String(2048), nullable=True,
    )
    github_access_token: Mapped[str | None] = mapped_column(
        String(512), nullable=True,
    )
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole), default=UserRole.MEMBER, nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False,
    )

    # ── Relationships ──────────────────────────────────────────
    repositories: Mapped[list["Repository"]] = relationship(
        back_populates="owner",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<User {self.username} ({self.email})>"


# ╔══════════════════════════════════════════════════════════════╗
# ║                   Repository Model                           ║
# ╚══════════════════════════════════════════════════════════════╝

class Repository(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    A connected Git repository.

    Linked to a user (owner) and contains many pull requests
    and reviews. The `settings` JSONB column stores per-repo
    configuration (ignored paths, severity thresholds, etc.).
    """
    __tablename__ = "repositories"

    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(
        String(255), nullable=False,
    )
    full_name: Mapped[str] = mapped_column(
        String(512), unique=True, index=True, nullable=False,
    )  # e.g. "octocat/hello-world"
    clone_url: Mapped[str] = mapped_column(
        String(2048), nullable=False,
    )
    default_branch: Mapped[str] = mapped_column(
        String(255), default="main", nullable=False,
    )
    provider: Mapped[GitProvider] = mapped_column(
        Enum(GitProvider), default=GitProvider.GITHUB, nullable=False,
    )
    language: Mapped[str | None] = mapped_column(
        String(100), nullable=True,
    )  # Primary language of the repo
    webhook_secret: Mapped[str | None] = mapped_column(
        String(512), nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False,
    )
    settings: Mapped[dict | None] = mapped_column(
        JSON, nullable=True, default=dict,
    )
    last_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    # ── Relationships ──────────────────────────────────────────
    owner: Mapped["User"] = relationship(
        back_populates="repositories",
    )
    pull_requests: Mapped[list["PullRequest"]] = relationship(
        back_populates="repository",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    # Many-to-one: one Repository has many Reviews (direct access)
    reviews: Mapped[list["Review"]] = relationship(
        back_populates="repository",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<Repository {self.full_name}>"


# ╔══════════════════════════════════════════════════════════════╗
# ║                  Pull Request Model                          ║
# ╚══════════════════════════════════════════════════════════════╝

class PullRequest(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    A pull / merge request within a repository.

    Dual status tracking:
      • `status`        — the PR lifecycle (open → merged / closed)
      • `review_status` — the AI review pipeline state
    """
    __tablename__ = "pull_requests"

    repository_id: Mapped[uuid.UUID] = mapped_column(
        UUID,
        ForeignKey("repositories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    pr_number: Mapped[int] = mapped_column(
        Integer, nullable=False,
    )
    title: Mapped[str] = mapped_column(
        String(1024), nullable=False,
    )
    author: Mapped[str] = mapped_column(
        String(255), nullable=False,
    )
    source_branch: Mapped[str] = mapped_column(
        String(255), nullable=False,
    )
    target_branch: Mapped[str] = mapped_column(
        String(255), nullable=False,
    )
    status: Mapped[PRStatus] = mapped_column(
        Enum(PRStatus), default=PRStatus.OPEN, nullable=False,
    )
    head_sha: Mapped[str] = mapped_column(
        String(40), nullable=False,
    )
    diff_content: Mapped[str | None] = mapped_column(
        Text, nullable=True,
    )
    review_status: Mapped[ReviewStatus] = mapped_column(
        Enum(ReviewStatus), default=ReviewStatus.PENDING, nullable=False,
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    # ── Relationships ──────────────────────────────────────────
    repository: Mapped["Repository"] = relationship(
        back_populates="pull_requests",
    )
    reviews: Mapped[list["Review"]] = relationship(
        back_populates="pull_request",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<PullRequest #{self.pr_number} '{self.title}'>"


# ╔══════════════════════════════════════════════════════════════╗
# ║                     Review Model                             ║
# ╚══════════════════════════════════════════════════════════════╝

class Review(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    An individual AI-generated review finding.

    Each review is tied to both a Repository (for aggregate queries)
    and a PullRequest (for PR-scoped views).

    Relationships:
      • Many Reviews → One Repository   (many-to-one)
      • Many Reviews → One PullRequest   (many-to-one)
    """
    __tablename__ = "reviews"

    # ── Foreign Keys ───────────────────────────────────────────
    repository_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID,
        ForeignKey("repositories.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    pull_request_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID,
        ForeignKey("pull_requests.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # ── Location ───────────────────────────────────────────────
    file_path: Mapped[str] = mapped_column(
        String(1024), nullable=False,
    )
    line_start: Mapped[int] = mapped_column(
        Integer, nullable=False,
    )
    line_end: Mapped[int | None] = mapped_column(
        Integer, nullable=True,
    )

    # ── Classification ─────────────────────────────────────────
    severity: Mapped[FindingSeverity] = mapped_column(
        Enum(FindingSeverity), nullable=False, index=True,
    )
    category: Mapped[FindingCategory] = mapped_column(
        Enum(FindingCategory), nullable=False, index=True,
    )
    rule_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True,
    )  # e.g. "SEC-001", "PERF-003"

    # ── Content ────────────────────────────────────────────────
    title: Mapped[str] = mapped_column(
        Text, nullable=False,
    )
    description: Mapped[str] = mapped_column(
        Text, nullable=False,
    )
    suggested_fix: Mapped[str | None] = mapped_column(
        Text, nullable=True,
    )
    code_snippet: Mapped[str | None] = mapped_column(
        Text, nullable=True,
    )

    # ── AI Metadata ────────────────────────────────────────────
    confidence_score: Mapped[float] = mapped_column(
        Float, default=0.0, nullable=False,
    )  # Range: 0.0 – 1.0
    detected_by: Mapped[str] = mapped_column(
        String(100), default="langchain", nullable=False,
    )  # "langchain" | "ast" | "combined"

    # ── Dismissal Workflow ─────────────────────────────────────
    is_dismissed: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
    )
    dismissed_by: Mapped[str | None] = mapped_column(
        String(255), nullable=True,
    )
    dismissed_reason: Mapped[str | None] = mapped_column(
        Text, nullable=True,
    )

    # ── Relationships ──────────────────────────────────────────
    repository: Mapped["Repository"] = relationship(
        back_populates="reviews",
    )
    pull_request: Mapped["PullRequest"] = relationship(
        back_populates="reviews",
    )

    def __repr__(self) -> str:
        return (
            f"<Review [{self.severity.value.upper()}] "
            f"{self.category.value} @ {self.file_path}:{self.line_start}>"
        )
