import os
import re


def redact_tableau_secrets(text: str) -> str:
    s = text
    pat = (os.environ.get("TABLEAU_PAT_VALUE") or "").strip()
    if pat and len(pat) > 8:
        s = s.replace(pat, "[REDACTED_TABLEAU_PAT]")
    s = re.sub(
        r'"personalAccessTokenSecret"\s*:\s*"[^"]*"',
        '"personalAccessTokenSecret":"[REDACTED]"',
        s,
        flags=re.I,
    )
    s = re.sub(
        r'"X-Tableau-Auth"\s*:\s*"[^"]*"',
        '"X-Tableau-Auth":"[REDACTED]"',
        s,
        flags=re.I,
    )
    return s
