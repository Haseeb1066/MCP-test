import asyncio
from collections.abc import Awaitable, Callable
from typing import TypeVar

T = TypeVar("T")

_lock = asyncio.Lock()


async def run_exclusive(fn: Callable[[], Awaitable[T]]) -> T:
    """Serialize MCP + agent calls (single stdio session)."""
    async with _lock:
        return await fn()
