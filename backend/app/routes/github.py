"""
AI Code Reviewer — GitHub OAuth & Repository Routes
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Endpoints:
  GET   /api/v1/auth/github              — Redirect to GitHub OAuth
  GET   /api/v1/auth/github/callback     — Handle OAuth callback
  GET   /api/v1/repositories             — List user's GitHub repositories
  POST  /api/v1/repositories/connect     — Connect a repo for review
  GET   /api/v1/repositories/{id}/files  — Browse repo file tree
  GET   /api/v1/repositories/{id}/file   — Fetch single file content
"""
from __future__ import annotations

import logging
import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Repository, GitProvider
from app.schemas import RepositoryBrief, RepositoryOut
from app.services.github_service import (
    GitHubService,
    GitHubOAuthError,
    GitHubAPIError,
    GitHubRateLimitError,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["GitHub"])

# ── Service singleton ─────────────────────────────────────────
_github = GitHubService()


# ╔══════════════════════════════════════════════════════════════╗
# ║                  Request / Response Schemas                  ║
# ╚══════════════════════════════════════════════════════════════╝

class OAuthRedirectResponse(BaseModel):
    authorization_url: str
    state: str


class OAuthCallbackResponse(BaseModel):
    access_token: str
    user: GitHubUserResponse


class GitHubUserResponse(BaseModel):
    id: int
    login: str
    email: str | None
    name: str | None
    avatar_url: str | None


class GitHubRepoResponse(BaseModel):
    id: int
    name: str
    full_name: str
    clone_url: str
    default_branch: str
    language: str | None
    private: bool


class ConnectRepoRequest(BaseModel):
    github_repo_full_name: str = Field(
        ...,
        examples=["octocat/hello-world"],
        description="Full name of the GitHub repo (owner/name)",
    )
    access_token: str = Field(
        ..., description="GitHub OAuth access token"
    )


class FileContentResponse(BaseModel):
    path: str
    content: str
    sha: str
    size: int


class FileTreeEntry(BaseModel):
    path: str
    type: str  # "blob" or "tree"
    sha: str
    size: int | None


# ╔══════════════════════════════════════════════════════════════╗
# ║                GitHub OAuth Endpoints                        ║
# ╚══════════════════════════════════════════════════════════════╝

@router.get(
    "/auth/github",
    response_model=OAuthRedirectResponse,
    summary="Start GitHub OAuth flow",
    description="Returns the GitHub authorization URL to redirect the user to.",
)
async def github_oauth_redirect() -> OAuthRedirectResponse:
    """Generate the OAuth authorization URL with a CSRF state token."""
    state = secrets.token_urlsafe(32)
    url = _github.get_oauth_url(state=state)
    return OAuthRedirectResponse(authorization_url=url, state=state)


@router.get(
    "/auth/github/callback",
    response_model=OAuthCallbackResponse,
    summary="GitHub OAuth callback",
    description="Exchange the authorization code for an access token.",
)
async def github_oauth_callback(
    code: str = Query(..., description="Authorization code from GitHub"),
    state: str = Query(..., description="CSRF state token to validate"),
) -> OAuthCallbackResponse:
    """
    Called by GitHub after the user authorizes.
    Exchanges the code for an access token and fetches the user profile.
    """
    # NOTE: In production, validate `state` against a stored value
    # (e.g. from session or Redis) to prevent CSRF attacks.

    try:
        access_token = await _github.exchange_code(code)
        github_user = await _github.get_user(access_token)
    except GitHubOAuthError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"OAuth failed: {str(e)}",
        )
    except Exception as e:
        logger.error("OAuth callback error: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to complete GitHub authentication",
        )

    return OAuthCallbackResponse(
        access_token=access_token,
        user=GitHubUserResponse(
            id=github_user.id,
            login=github_user.login,
            email=github_user.email,
            name=github_user.name,
            avatar_url=github_user.avatar_url,
        ),
    )


# ╔══════════════════════════════════════════════════════════════╗
# ║              Repository Management Endpoints                 ║
# ╚══════════════════════════════════════════════════════════════╝

@router.get(
    "/repositories/github",
    response_model=list[GitHubRepoResponse],
    summary="List GitHub repositories",
    description="Fetch the authenticated user's GitHub repositories.",
)
async def list_github_repos(
    access_token: str = Query(
        ..., description="GitHub OAuth access token"
    ),
    page: int = Query(1, ge=1),
    per_page: int = Query(30, ge=1, le=100),
) -> list[GitHubRepoResponse]:
    """List repos from GitHub API (not yet connected to our platform)."""
    try:
        repos = await _github.list_repositories(
            access_token=access_token,
            page=page,
            per_page=per_page,
        )
    except GitHubRateLimitError as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(e),
        )
    except GitHubAPIError as e:
        raise HTTPException(
            status_code=e.status_code,
            detail=str(e),
        )

    return [
        GitHubRepoResponse(
            id=r.id,
            name=r.name,
            full_name=r.full_name,
            clone_url=r.clone_url,
            default_branch=r.default_branch,
            language=r.language,
            private=r.private,
        )
        for r in repos
    ]


@router.post(
    "/repositories/connect",
    response_model=RepositoryOut,
    status_code=status.HTTP_201_CREATED,
    summary="Connect a GitHub repository",
    description="Register a GitHub repo for AI code review.",
)
async def connect_repository(
    payload: ConnectRepoRequest,
    db: AsyncSession = Depends(get_db),
) -> RepositoryOut:
    """
    Connect a GitHub repo to the platform:
      1. Verify the repo exists on GitHub
      2. Check it's not already connected
      3. Create a Repository record in our DB
    """
    # Check if already connected
    existing = await db.execute(
        select(Repository).where(
            Repository.full_name == payload.github_repo_full_name
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Repository '{payload.github_repo_full_name}' "
            f"is already connected",
        )

    # Fetch repo metadata from GitHub
    try:
        repos = await _github.list_repositories(
            access_token=payload.access_token
        )
        github_repo = next(
            (r for r in repos
             if r.full_name == payload.github_repo_full_name),
            None,
        )
    except GitHubAPIError as e:
        raise HTTPException(
            status_code=e.status_code,
            detail=f"GitHub API error: {str(e)}",
        )

    if not github_repo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository '{payload.github_repo_full_name}' "
            f"not found or not accessible",
        )

    # Create local record
    # NOTE: owner_id should come from the authenticated user session.
    # Using a placeholder UUID here — wire to auth middleware in production.
    repo = Repository(
        owner_id=uuid.uuid4(),  # TODO: Replace with authenticated user ID
        name=github_repo.name,
        full_name=github_repo.full_name,
        clone_url=github_repo.clone_url,
        default_branch=github_repo.default_branch,
        provider=GitProvider.GITHUB,
        language=github_repo.language,
        is_active=True,
        settings={},
    )
    db.add(repo)
    await db.flush()
    await db.refresh(repo)

    logger.info("Connected repository: %s", repo.full_name)
    return RepositoryOut.model_validate(repo)


@router.get(
    "/repositories",
    response_model=list[RepositoryBrief],
    summary="List connected repositories",
    description="List all repositories registered on the platform.",
)
async def list_connected_repos(
    db: AsyncSession = Depends(get_db),
    is_active: bool | None = Query(None),
) -> list[RepositoryBrief]:
    """Fetch repositories stored in our DB."""
    query = select(Repository)
    if is_active is not None:
        query = query.where(Repository.is_active == is_active)
    query = query.order_by(Repository.created_at.desc())

    result = await db.execute(query)
    repos = result.scalars().all()
    return [RepositoryBrief.model_validate(r) for r in repos]


# ╔══════════════════════════════════════════════════════════════╗
# ║                File Browsing Endpoints                       ║
# ╚══════════════════════════════════════════════════════════════╝

@router.get(
    "/repositories/{repo_id}/files",
    response_model=list[FileTreeEntry],
    summary="Browse repository file tree",
)
async def get_repo_file_tree(
    repo_id: uuid.UUID,
    access_token: str = Query(
        ..., description="GitHub OAuth access token"
    ),
    ref: str = Query("HEAD", description="Branch, tag, or SHA"),
    db: AsyncSession = Depends(get_db),
) -> list[FileTreeEntry]:
    """Fetch the full file tree of a connected repository."""
    repo = await db.get(Repository, repo_id)
    if not repo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository {repo_id} not found",
        )

    try:
        tree = await _github.get_repository_tree(
            access_token=access_token,
            repo_full_name=repo.full_name,
            ref=ref,
        )
    except GitHubAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))

    return [FileTreeEntry(**entry) for entry in tree]


@router.get(
    "/repositories/{repo_id}/file",
    response_model=FileContentResponse,
    summary="Fetch single file content",
)
async def get_file_content(
    repo_id: uuid.UUID,
    path: str = Query(..., description="File path within the repo"),
    access_token: str = Query(
        ..., description="GitHub OAuth access token"
    ),
    ref: str | None = Query(None, description="Branch, tag, or SHA"),
    db: AsyncSession = Depends(get_db),
) -> FileContentResponse:
    """Fetch and decode the content of a single file from a repo."""
    repo = await db.get(Repository, repo_id)
    if not repo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repository {repo_id} not found",
        )

    try:
        file = await _github.get_file_content(
            access_token=access_token,
            repo_full_name=repo.full_name,
            file_path=path,
            ref=ref,
        )
    except GitHubAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))

    return FileContentResponse(
        path=file.path,
        content=file.content,
        sha=file.sha,
        size=file.size,
    )
