"""
AI Code Reviewer — Central Router
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Aggregates all route modules into a single router
for clean registration in main.py.
"""
from fastapi import APIRouter

from app.routes.reviews import router as reviews_router
from app.routes.github import router as github_router

# ── Master router (includes all sub-routers) ──────────────────
api_router = APIRouter()
api_router.include_router(reviews_router)
api_router.include_router(github_router)
