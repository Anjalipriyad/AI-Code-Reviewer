"""
AI Code Reviewer — Database Engine, Session & Dependencies
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Centralizes all database connectivity:
  • Async engine via asyncpg
  • Scoped async session factory
  • FastAPI dependency for request-scoped sessions
  • Table creation utility for development
"""
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


# ╔══════════════════════════════════════════════════════════════╗
# ║                    Declarative Base                          ║
# ╚══════════════════════════════════════════════════════════════╝

class Base(DeclarativeBase):
    """
    Base class for all ORM models.

    All models inherit from this so Alembic and `create_all()`
    can discover every table through `Base.metadata`.
    """
    pass


# ╔══════════════════════════════════════════════════════════════╗
# ║                    Async Engine                              ║
# ╚══════════════════════════════════════════════════════════════╝

url = settings.get_database_url()
is_sqlite = url.startswith("sqlite")

engine_kwargs = {
    "echo": False,
}

if not is_sqlite:
    engine_kwargs.update({
        "pool_size": 20,
        "max_overflow": 10,
        "pool_pre_ping": True,
    })

engine = create_async_engine(url, **engine_kwargs)


# ╔══════════════════════════════════════════════════════════════╗
# ║                  Session Factory                             ║
# ╚══════════════════════════════════════════════════════════════╝

async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ╔══════════════════════════════════════════════════════════════╗
# ║              FastAPI Dependency — get_db                     ║
# ╚══════════════════════════════════════════════════════════════╝

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Yields a request-scoped async database session.

    Usage in routes:
        @router.get("/items")
        async def list_items(db: AsyncSession = Depends(get_db)):
            ...

    Automatically commits on success, rolls back on exception.
    """
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ╔══════════════════════════════════════════════════════════════╗
# ║              Table Creation (Dev / Testing)                  ║
# ╚══════════════════════════════════════════════════════════════╝

async def create_tables() -> None:
    """
    Create all tables defined in Base.metadata.

    WARNING: Use Alembic migrations in production.
    This is provided for rapid development and testing only.
    """
    # Import models to ensure they register with Base.metadata
    import app.models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def drop_tables() -> None:
    """Drop all tables. Use only in testing."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
