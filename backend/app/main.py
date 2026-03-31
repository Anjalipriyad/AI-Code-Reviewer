"""
AI Code Reviewer — FastAPI Application Factory
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import create_tables, engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle hook."""
    await create_tables()  # DEV only — use Alembic in production
    yield
    await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(
        title="AI Code Reviewer",
        description="Autonomous AI-powered code review engine",
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    # ── CORS ──
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.backend_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routes ──
    from app.routes import api_router
    app.include_router(api_router)

    @app.get("/health", tags=["Health"])
    async def health_check():
        return {"status": "healthy", "service": "ai-code-reviewer"}

    return app


app = create_app()

