"""Cross-platform helpers (Windows subprocess / npx)."""

from __future__ import annotations

import asyncio
import shutil
import sys


def ensure_windows_event_loop() -> None:
    """Best-effort; MCP stdio uses subprocess.Popen and does not rely on asyncio subprocess."""
    if sys.platform == "win32":
        try:
            asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
        except Exception:
            pass


def mcp_spawn_command(argv: list[str]) -> list[str]:
    """
    Build a command that starts Tableau MCP on Windows and Unix.
    On Windows, `cmd /c npx ...` avoids NotImplementedError from asyncio subprocess.
    """
    if not argv:
        return argv

    if sys.platform == "win32":
        if argv[0].lower() in ("npx", "npx.cmd"):
            rest = argv[1:]
            npx = shutil.which("npx.cmd") or shutil.which("npx")
            if npx:
                return [npx, *rest]
            return ["cmd", "/c", "npx", *rest]
        return argv

    if argv[0] == "npx":
        npx = shutil.which("npx")
        if npx:
            return [npx, *argv[1:]]
    return argv


ensure_windows_event_loop()
