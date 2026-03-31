"""
AI Code Reviewer — GitHub Service
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Handles the full GitHub integration surface:

  1. OAuth Flow
     • Build the authorization URL for GitHub login
     • Exchange the temporary `code` for an access token
     • Fetch the authenticated user's profile

  2. Repository Operations
     • List repositories for the authenticated user
     • Fetch file content (single file or tree) from a repo
     • Fetch pull request diffs
     • Manage webhooks for real-time PR events

All HTTP calls use httpx.AsyncClient for non-blocking I/O.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlencode

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# ── GitHub API Constants ──────────────────────────────────────────
GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_API_BASE = "https://api.github.com"

# Scopes we request during OAuth
DEFAULT_SCOPES = ["repo", "read:user", "user:email"]


# ╔══════════════════════════════════════════════════════════════╗
# ║                  Response Dataclasses                        ║
# ╚══════════════════════════════════════════════════════════════╝

@dataclass
class GitHubUser:
    """Parsed GitHub user profile."""
    id: int
    login: str
    email: str | None
    name: str | None
    avatar_url: str | None
    html_url: str


@dataclass
class GitHubRepo:
    """Parsed GitHub repository metadata."""
    id: int
    name: str
    full_name: str
    clone_url: str
    default_branch: str
    language: str | None
    private: bool
    html_url: str


@dataclass
class FileContent:
    """Fetched file from a GitHub repository."""
    path: str
    content: str           # Decoded UTF-8 content
    sha: str
    size: int
    encoding: str = "utf-8"


@dataclass
class PullRequestDiff:
    """Diff data for a pull request."""
    pr_number: int
    title: str
    author: str
    source_branch: str
    target_branch: str
    head_sha: str
    diff: str              # Unified diff text
    changed_files: list[dict[str, Any]] = field(default_factory=list)


# ╔══════════════════════════════════════════════════════════════╗
# ║                    GitHub Service                            ║
# ╚══════════════════════════════════════════════════════════════╝

class GitHubService:
    """
    Stateless service for GitHub API interactions.

    Usage:
        github = GitHubService()

        # OAuth
        url = github.get_oauth_url(state="random-csrf-token")
        token = await github.exchange_code(code="abc123")
        user = await github.get_user(token)

        # Repo operations
        content = await github.get_file_content(token, "owner/repo", "src/main.py")
    """

    def __init__(self) -> None:
        self._client_id = settings.github_client_id
        self._client_secret = settings.github_client_secret

    # ──────────────────────────────────────────────────────────
    #  OAuth Flow
    # ──────────────────────────────────────────────────────────

    def get_oauth_url(
        self,
        state: str,
        scopes: list[str] | None = None,
        redirect_uri: str | None = None,
    ) -> str:
        """
        Build the GitHub OAuth authorization URL.

        Args:
            state: CSRF token to verify the callback.
            scopes: OAuth scopes (defaults to repo + user).
            redirect_uri: Where GitHub redirects after auth.

        Returns:
            The full authorization URL to redirect the user to.
        """
        params: dict[str, str] = {
            "client_id": self._client_id,
            "scope": " ".join(scopes or DEFAULT_SCOPES),
            "state": state,
        }
        if redirect_uri:
            params["redirect_uri"] = redirect_uri

        url = f"{GITHUB_AUTH_URL}?{urlencode(params)}"
        logger.debug("Built OAuth URL: %s", url)
        return url

    async def exchange_code(self, code: str) -> str:
        """
        Exchange the temporary authorization code for an access token.

        Args:
            code: The code parameter from the OAuth callback.

        Returns:
            The GitHub access token string.

        Raises:
            GitHubOAuthError: If the exchange fails.
        """
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                GITHUB_TOKEN_URL,
                json={
                    "client_id": self._client_id,
                    "client_secret": self._client_secret,
                    "code": code,
                },
                headers={"Accept": "application/json"},
            )
            response.raise_for_status()
            data = response.json()

        if "error" in data:
            error_msg = data.get("error_description", data["error"])
            logger.error("OAuth token exchange failed: %s", error_msg)
            raise GitHubOAuthError(error_msg)

        token = data["access_token"]
        logger.info("Successfully exchanged OAuth code for access token")
        return token

    async def get_user(self, access_token: str) -> GitHubUser:
        """
        Fetch the authenticated GitHub user's profile.

        Args:
            access_token: Valid GitHub OAuth token.

        Returns:
            GitHubUser with profile data.
        """
        data = await self._api_get("/user", access_token)

        # Email may be private — fetch from /user/emails endpoint
        email = data.get("email")
        if not email:
            email = await self._get_primary_email(access_token)

        return GitHubUser(
            id=data["id"],
            login=data["login"],
            email=email,
            name=data.get("name"),
            avatar_url=data.get("avatar_url"),
            html_url=data["html_url"],
        )

    async def _get_primary_email(self, access_token: str) -> str | None:
        """Fetch the user's primary verified email."""
        try:
            emails = await self._api_get("/user/emails", access_token)
            for entry in emails:
                if entry.get("primary") and entry.get("verified"):
                    return entry["email"]
        except Exception as e:
            logger.warning("Could not fetch user emails: %s", e)
        return None

    # ──────────────────────────────────────────────────────────
    #  Repository Operations
    # ──────────────────────────────────────────────────────────

    async def list_repositories(
        self,
        access_token: str,
        page: int = 1,
        per_page: int = 30,
        sort: str = "updated",
    ) -> list[GitHubRepo]:
        """
        List repositories accessible to the authenticated user.

        Args:
            access_token: GitHub OAuth token.
            page: Pagination page number.
            per_page: Results per page (max 100).
            sort: Sort field — 'created', 'updated', 'pushed', 'full_name'.

        Returns:
            List of GitHubRepo objects.
        """
        data = await self._api_get(
            f"/user/repos?page={page}&per_page={per_page}"
            f"&sort={sort}&affiliation=owner,collaborator",
            access_token,
        )
        return [
            GitHubRepo(
                id=repo["id"],
                name=repo["name"],
                full_name=repo["full_name"],
                clone_url=repo["clone_url"],
                default_branch=repo.get("default_branch", "main"),
                language=repo.get("language"),
                private=repo["private"],
                html_url=repo["html_url"],
            )
            for repo in data
        ]

    async def get_file_content(
        self,
        access_token: str,
        repo_full_name: str,
        file_path: str,
        ref: str | None = None,
    ) -> FileContent:
        """
        Fetch a single file's content from a repository.

        Args:
            access_token: GitHub OAuth token.
            repo_full_name: "owner/repo" format.
            file_path: Path within the repository (e.g. "src/main.py").
            ref: Branch, tag, or commit SHA (defaults to repo's default branch).

        Returns:
            FileContent with decoded file text.

        Raises:
            GitHubAPIError: If the file is not found or request fails.
        """
        endpoint = f"/repos/{repo_full_name}/contents/{file_path}"
        if ref:
            endpoint += f"?ref={ref}"

        data = await self._api_get(endpoint, access_token)

        # GitHub returns base64-encoded content for files
        if data.get("encoding") == "base64":
            import base64
            content = base64.b64decode(data["content"]).decode("utf-8")
        else:
            content = data.get("content", "")

        return FileContent(
            path=data["path"],
            content=content,
            sha=data["sha"],
            size=data.get("size", 0),
            encoding="utf-8",
        )

    async def get_repository_tree(
        self,
        access_token: str,
        repo_full_name: str,
        ref: str = "HEAD",
        recursive: bool = True,
    ) -> list[dict[str, Any]]:
        """
        Fetch the full file tree of a repository.

        Returns a list of tree entries:
            [{"path": "src/main.py", "type": "blob", "sha": "...", "size": 1234}, ...]
        """
        endpoint = f"/repos/{repo_full_name}/git/trees/{ref}"
        if recursive:
            endpoint += "?recursive=1"

        data = await self._api_get(endpoint, access_token)
        return [
            {
                "path": entry["path"],
                "type": entry["type"],   # "blob" or "tree"
                "sha": entry["sha"],
                "size": entry.get("size"),
            }
            for entry in data.get("tree", [])
        ]

    # ──────────────────────────────────────────────────────────
    #  Pull Request Operations
    # ──────────────────────────────────────────────────────────

    async def get_pull_request_diff(
        self,
        access_token: str,
        repo_full_name: str,
        pr_number: int,
    ) -> PullRequestDiff:
        """
        Fetch a pull request's metadata and unified diff.

        Args:
            access_token: GitHub OAuth token.
            repo_full_name: "owner/repo" format.
            pr_number: The PR number in the repository.

        Returns:
            PullRequestDiff containing metadata + raw diff text.
        """
        # Fetch PR metadata
        pr_data = await self._api_get(
            f"/repos/{repo_full_name}/pulls/{pr_number}",
            access_token,
        )

        # Fetch the diff (raw patch)
        diff_text = await self._api_get_raw(
            f"/repos/{repo_full_name}/pulls/{pr_number}",
            access_token,
            accept="application/vnd.github.v3.diff",
        )

        # Fetch changed files for structured data
        files_data = await self._api_get(
            f"/repos/{repo_full_name}/pulls/{pr_number}/files",
            access_token,
        )
        changed_files = [
            {
                "filename": f["filename"],
                "status": f["status"],  # added, removed, modified, renamed
                "additions": f["additions"],
                "deletions": f["deletions"],
                "patch": f.get("patch", ""),
            }
            for f in files_data
        ]

        return PullRequestDiff(
            pr_number=pr_data["number"],
            title=pr_data["title"],
            author=pr_data["user"]["login"],
            source_branch=pr_data["head"]["ref"],
            target_branch=pr_data["base"]["ref"],
            head_sha=pr_data["head"]["sha"],
            diff=diff_text,
            changed_files=changed_files,
        )

    async def list_pull_requests(
        self,
        access_token: str,
        repo_full_name: str,
        state: str = "open",
        page: int = 1,
        per_page: int = 30,
    ) -> list[dict[str, Any]]:
        """List pull requests for a repository."""
        data = await self._api_get(
            f"/repos/{repo_full_name}/pulls"
            f"?state={state}&page={page}&per_page={per_page}",
            access_token,
        )
        return [
            {
                "number": pr["number"],
                "title": pr["title"],
                "author": pr["user"]["login"],
                "state": pr["state"],
                "source_branch": pr["head"]["ref"],
                "target_branch": pr["base"]["ref"],
                "head_sha": pr["head"]["sha"],
                "created_at": pr["created_at"],
                "updated_at": pr["updated_at"],
            }
            for pr in data
        ]

    # ──────────────────────────────────────────────────────────
    #  Webhook Management
    # ──────────────────────────────────────────────────────────

    async def create_webhook(
        self,
        access_token: str,
        repo_full_name: str,
        callback_url: str,
        secret: str,
        events: list[str] | None = None,
    ) -> dict[str, Any]:
        """
        Register a webhook on a repository for PR events.

        Args:
            access_token: GitHub OAuth token with repo scope.
            repo_full_name: "owner/repo".
            callback_url: The URL GitHub will POST events to.
            secret: HMAC secret for webhook signature verification.
            events: GitHub event types (defaults to pull_request).

        Returns:
            The created webhook payload from GitHub.
        """
        payload = {
            "name": "web",
            "active": True,
            "events": events or ["pull_request"],
            "config": {
                "url": callback_url,
                "content_type": "json",
                "secret": secret,
                "insecure_ssl": "0",
            },
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{GITHUB_API_BASE}/repos/{repo_full_name}/hooks",
                json=payload,
                headers=self._auth_headers(access_token),
            )
            response.raise_for_status()
            data = response.json()

        logger.info(
            "Created webhook %s for %s", data.get("id"), repo_full_name
        )
        return data

    async def delete_webhook(
        self,
        access_token: str,
        repo_full_name: str,
        hook_id: int,
    ) -> None:
        """Delete a webhook from a repository."""
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.delete(
                f"{GITHUB_API_BASE}/repos/{repo_full_name}/hooks/{hook_id}",
                headers=self._auth_headers(access_token),
            )
            response.raise_for_status()

        logger.info(
            "Deleted webhook %s from %s", hook_id, repo_full_name
        )

    # ──────────────────────────────────────────────────────────
    #  Webhook Signature Verification
    # ──────────────────────────────────────────────────────────

    @staticmethod
    def verify_webhook_signature(
        payload_body: bytes,
        signature_header: str,
        secret: str,
    ) -> bool:
        """
        Verify the HMAC-SHA256 signature of a GitHub webhook payload.

        Args:
            payload_body: Raw request body bytes.
            signature_header: The 'X-Hub-Signature-256' header value.
            secret: The webhook secret configured on the repo.

        Returns:
            True if the signature is valid.
        """
        import hashlib
        import hmac

        if not signature_header.startswith("sha256="):
            return False

        expected = hmac.new(
            secret.encode("utf-8"),
            payload_body,
            hashlib.sha256,
        ).hexdigest()

        received = signature_header[7:]  # strip "sha256="
        return hmac.compare_digest(expected, received)

    # ──────────────────────────────────────────────────────────
    #  Internal HTTP Helpers
    # ──────────────────────────────────────────────────────────

    @staticmethod
    def _auth_headers(access_token: str) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    async def _api_get(
        self,
        endpoint: str,
        access_token: str,
    ) -> Any:
        """Make an authenticated GET request to the GitHub API."""
        url = (
            endpoint
            if endpoint.startswith("http")
            else f"{GITHUB_API_BASE}{endpoint}"
        )

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                url,
                headers=self._auth_headers(access_token),
            )

            # Handle rate limiting
            if response.status_code == 403:
                remaining = response.headers.get("X-RateLimit-Remaining", "?")
                reset = response.headers.get("X-RateLimit-Reset", "?")
                logger.warning(
                    "GitHub API rate limit hit. Remaining: %s, Reset: %s",
                    remaining,
                    reset,
                )
                raise GitHubRateLimitError(
                    f"Rate limited. Resets at {reset}. "
                    f"Remaining: {remaining}"
                )

            if response.status_code == 404:
                raise GitHubAPIError(
                    f"Resource not found: {endpoint}",
                    status_code=404,
                )

            response.raise_for_status()
            return response.json()

    async def _api_get_raw(
        self,
        endpoint: str,
        access_token: str,
        accept: str = "application/vnd.github.v3.raw",
    ) -> str:
        """Make a GET request and return raw text (for diffs, patches)."""
        url = f"{GITHUB_API_BASE}{endpoint}"

        async with httpx.AsyncClient(timeout=30.0) as client:
            headers = self._auth_headers(access_token)
            headers["Accept"] = accept
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            return response.text


# ╔══════════════════════════════════════════════════════════════╗
# ║                    Custom Exceptions                         ║
# ╚══════════════════════════════════════════════════════════════╝

class GitHubServiceError(Exception):
    """Base exception for GitHub service errors."""
    pass


class GitHubOAuthError(GitHubServiceError):
    """OAuth flow failure (bad code, expired token, etc.)."""
    pass


class GitHubAPIError(GitHubServiceError):
    """GitHub API returned an error response."""

    def __init__(self, message: str, status_code: int = 500) -> None:
        super().__init__(message)
        self.status_code = status_code


class GitHubRateLimitError(GitHubServiceError):
    """GitHub API rate limit (5000 req/hr for authenticated users)."""
    pass
