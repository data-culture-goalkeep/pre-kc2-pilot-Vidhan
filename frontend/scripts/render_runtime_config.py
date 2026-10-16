#!/usr/bin/env python3
"""Render browser-safe Supabase runtime config from environment variables."""
from __future__ import annotations

import base64
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "dist" / "runtime-config.js"

url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
key = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "").strip()
phase3_writes_requested = os.environ.get("TAMAHAR_PHASE3_WRITES", "").strip().lower() in {"1", "true", "yes"}


def legacy_role(value: str) -> str | None:
    parts = value.split(".")
    if len(parts) != 3:
        return None
    try:
        raw = parts[1] + "=" * (-len(parts[1]) % 4)
        payload = json.loads(base64.urlsafe_b64decode(raw).decode("utf-8"))
        return payload.get("role")
    except Exception:
        return None


if key.startswith("sb_secret_") or legacy_role(key) == "service_role":
    raise SystemExit(
        "Refusing to expose a Supabase secret/service-role key in browser configuration"
    )

missing = [
    name
    for name, value in (
        ("SUPABASE_URL", url),
        ("SUPABASE_PUBLISHABLE_KEY", key),
    )
    if not value
]

local_supabase = url.startswith("http://127.0.0.1:") or url.startswith("http://localhost:")
approved_production_supabase = url == "https://fclinhmjjtpfikyqmssz.supabase.co"
phase3_write_target_allowed = local_supabase or approved_production_supabase
if phase3_writes_requested and url and not phase3_write_target_allowed:
    raise SystemExit("Refusing to enable Phase 3 browser writes for an unapproved Supabase URL")

if missing:
    # A missing public-client setting must not make a static Preview undeployable.
    # Generate an intentionally disconnected config: backend.js will show the
    # existing safe "backend access pending" state and will not query Supabase.
    print(
        "Warning: missing browser runtime configuration: "
        + ", ".join(missing)
        + ". Generating a disconnected read-only config."
    )
    url = ""
    key = ""

payload = (
    "// Generated at deployment time. Do not commit this file.\n"
    "window.TAMAHAR_CONFIG = Object.freeze({\n"
    "  ...window.TAMAHAR_CONFIG,\n"
    f"  supabaseUrl: {json.dumps(url)},\n"
    f"  supabasePublishableKey: {json.dumps(key)},\n"
    f"  phase3Writes: {json.dumps(bool(phase3_writes_requested and phase3_write_target_allowed))}\n"
    "});\n"
)

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(payload, encoding="utf-8")
print(f"Wrote {OUTPUT}")
