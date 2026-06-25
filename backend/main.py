"""FastAPI entry: Tableau MCP chat API + optional static UI."""

from __future__ import annotations

import backend.platform_fix  # noqa: F401 — Windows subprocess / event loop

from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from openai import OpenAI
from pydantic import BaseModel

from backend.chat import run_agent_turn
from backend.chat_mode import get_tableau_chat_mode
from backend.config import env
from backend.runner import run_exclusive
from backend.tableau_fields import (
    check_metadata_api_access,
    fetch_published_datasource_fields,
    probe_tableau_sign_in,
)
from backend.workbooks import (
    SelectedWorkbook,
    WorkbookSummary,
    list_workbooks_via_mcp,
    resolve_workbook_via_mcp,
)
from backend.mcp_tableau import get_mcp_client, mcp_tableau_env_summary

ROOT = Path(__file__).resolve().parent.parent
WEB_DIST = ROOT / "dist" / "web"


class ChatMessage(BaseModel):
    role: str
    content: str


class SelectedWorkbookBody(BaseModel):
    id: str
    name: str
    contentUrl: Optional[str] = None
    projectName: Optional[str] = None
    defaultViewId: Optional[str] = None


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    selectedWorkbook: Optional[SelectedWorkbookBody] = None
    extensionMode: Optional[bool] = None


def _parse_workbook(body: Optional[SelectedWorkbookBody]) -> Optional[SelectedWorkbook]:
    if not body:
        return None
    wid = body.id.strip()
    name = body.name.strip()
    if not wid or not name:
        return None
    return WorkbookSummary(
        id=wid,
        name=name,
        content_url=body.contentUrl,
        project_name=body.projectName,
        default_view_id=body.defaultViewId,
    )


app = FastAPI(title="Tableau MCP Chat", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, Any]:
    has_keys = bool(
        env("OPENAI_API_KEY")
        and env("TABLEAU_SERVER")
        and env("TABLEAU_PAT_NAME")
        and env("TABLEAU_PAT_VALUE")
    )
    tableau = probe_tableau_sign_in() if has_keys else {"tableauSignInOk": False, "tableauHint": "Set Tableau vars in .env"}
    ok = has_keys and bool(env("OPENAI_API_KEY")) and tableau.get("tableauSignInOk") is True
    mcp_env = mcp_tableau_env_summary() if has_keys else {}
    return {
        "ok": ok,
        "hasOpenAi": bool(env("OPENAI_API_KEY")),
        "hasTableau": bool(env("TABLEAU_SERVER")),
        "chatMode": get_tableau_chat_mode(),
        "backend": "python",
        "mcpSiteName": mcp_env.get("SITE_NAME", ""),
        "mcpPatName": mcp_env.get("PAT_NAME", ""),
        **tableau,
    }


@app.get("/api/workbooks/resolve")
async def api_resolve_workbook(
    id: Optional[str] = Query(None, alias="workbookId"),
    name: Optional[str] = Query(None),
    contentUrl: Optional[str] = Query(None),
    projectName: Optional[str] = Query(None),
) -> dict[str, Any]:
    """Resolve workbook LUID by id, name, project, or contentUrl (for Tableau dashboard extensions)."""
    if not any(
        [
            (id or "").strip(),
            (name or "").strip(),
            (contentUrl or "").strip(),
        ]
    ):
        raise HTTPException(
            status_code=400,
            detail="Provide query parameter workbookId=, name=, or contentUrl=",
        )

    try:

        async def _run() -> dict[str, Any] | None:
            await get_mcp_client()
            wb = await resolve_workbook_via_mcp(
                workbook_id=id,
                name=name,
                content_url=contentUrl,
                project_name=projectName,
            )
            return wb.to_api_dict() if wb else None

        workbook = await run_exclusive(_run)
        if not workbook:
            raise HTTPException(
                status_code=404,
                detail=(
                    f"No workbook matched workbookId={id!r} name={name!r} projectName={projectName!r} "
                    f"contentUrl={contentUrl!r}. "
                    "From the dropdown, copy the workbook id or use contentUrl=Sales for Sales · Sales."
                ),
            )
        return {"workbook": workbook}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/api/workbooks")
async def api_workbooks() -> dict[str, Any]:
    import logging
    import traceback

    log = logging.getLogger("uvicorn.error")

    try:

        async def _run() -> list[dict[str, Any]]:
            await get_mcp_client()
            wbs = await list_workbooks_via_mcp()
            return [w.to_api_dict() for w in wbs]

        workbooks = await run_exclusive(_run)
        return {"workbooks": workbooks}
    except Exception as e:
        log.error("GET /api/workbooks failed:\n%s", traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/api/metadata-check")
def api_metadata_check() -> dict[str, Any]:
    try:
        return check_metadata_api_access()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/api/datasource-fields")
def api_datasource_fields(
    luid: Optional[str] = Query(None),
    name: Optional[str] = Query(None),
) -> dict[str, Any]:
    identifier = (luid or name or "").strip()
    if not identifier:
        raise HTTPException(status_code=400, detail="Provide query parameter luid= or name=")
    try:
        return fetch_published_datasource_fields(identifier)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/api/chat")
async def api_chat(body: ChatRequest) -> dict[str, Any]:
    if not body.messages:
        raise HTTPException(status_code=400, detail="Expected { messages: [{ role, content }] }")

    api_key = env("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="OPENAI_API_KEY is not set in the server environment (.env).",
        )

    workbook = _parse_workbook(body.selectedWorkbook)
    normalized: list[dict[str, str]] = []
    for m in body.messages:
        if m.role not in ("user", "assistant"):
            raise HTTPException(status_code=400, detail=f"Unsupported role: {m.role}")
        normalized.append({"role": m.role, "content": m.content})

    openai_client = OpenAI(api_key=api_key)

    extension_mode = body.extensionMode is True

    async def _run():
        return await run_agent_turn(
            openai_client,
            normalized,
            workbook,
            extension_mode=extension_mode,
        )

    try:
        result = await run_exclusive(_run)
        return {
            "reply": result.reply,
            "steps": [s.to_api_dict() for s in result.steps],
            "timing": result.timing.to_api_dict(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


# Production: serve built React app
if WEB_DIST.is_dir():
    assets = WEB_DIST / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/")
    async def spa_index():
        return FileResponse(WEB_DIST / "index.html")

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        if full_path.startswith("api"):
            raise HTTPException(status_code=404)
        file_path = WEB_DIST / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(WEB_DIST / "index.html")
