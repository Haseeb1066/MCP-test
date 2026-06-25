#!/usr/bin/env python3
"""Test Tableau PAT from .env — run: python scripts/test-pat.py"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import httpx

from backend.config import env
from backend.tableau_fields import probe_tableau_sign_in


def try_sign_in(site: str, pat_name: str, pat_secret: str) -> tuple[bool, int, str]:
    server = env("TABLEAU_SERVER").rstrip("/")
    r = httpx.post(
        f"{server}/api/3.27/auth/signin",
        headers={"Accept": "application/json", "Content-Type": "application/json"},
        json={
            "credentials": {
                "site": {"contentUrl": site},
                "personalAccessTokenName": pat_name,
                "personalAccessTokenSecret": pat_secret,
            }
        },
        verify=env("TABLEAU_SSL_VERIFY") != "0",
        timeout=30,
    )
    detail = ""
    try:
        detail = r.json().get("error", {}).get("detail", r.text[:200])
    except Exception:
        detail = r.text[:200]
    ok = r.status_code == 200 and "token" in r.text
    return ok, r.status_code, detail


def main() -> None:
    pat = env("TABLEAU_PAT_VALUE")
    name = env("TABLEAU_PAT_NAME")
    site = env("TABLEAU_SITE_NAME")

    print("TABLEAU_SERVER:", env("TABLEAU_SERVER"))
    print("TABLEAU_SITE_NAME:", repr(site))
    print("TABLEAU_PAT_NAME:", repr(name))
    print("TABLEAU_PAT_VALUE length:", len(pat))
    print()

    if not pat or not name:
        print("FAIL: Set TABLEAU_PAT_NAME and TABLEAU_PAT_VALUE in .env")
        sys.exit(1)

    print("=== Current .env ===")
    probe = probe_tableau_sign_in()
    print(json.dumps(probe, indent=2))
    print()

    print("=== Try other site / name combos (if current fails) ===")
    for s in [site, "", "multinetpakistanpvtltd"]:
        if s in (site,):
            pass
        for n in [name, name.lower(), name.upper()]:
            if n == name and s == site:
                continue
            ok, code, detail = try_sign_in(s, n, pat)
            print(f"  {'OK' if ok else 'FAIL'} site={s!r} name={n!r} -> {code} {detail[:60]}")

    if probe.get("tableauSignInOk"):
        print("\nPAT is working for your current .env settings.")
        sys.exit(0)
    print("\nPAT failed. Create token on the SAME site you use in TABLEAU_SITE_NAME.")
    print("PAT name in Tableau must match TABLEAU_PAT_NAME exactly (case-sensitive).")
    sys.exit(1)


if __name__ == "__main__":
    main()
