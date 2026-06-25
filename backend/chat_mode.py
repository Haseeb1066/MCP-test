from __future__ import annotations

from typing import Literal

from backend.config import env

TableauChatMode = Literal["workbook", "datasource"]

LOCAL_DATASOURCE_FIELDS_TOOL = "list-published-datasource-fields"

WORKBOOK_MODE_EXCLUDE_GROUPS = ("datasource",)


def get_tableau_chat_mode() -> TableauChatMode:
    raw = (env("TABLEAU_CHAT_MODE") or "workbook").lower()
    return "datasource" if raw == "datasource" else "workbook"


def is_workbook_mode() -> bool:
    return get_tableau_chat_mode() == "workbook"
