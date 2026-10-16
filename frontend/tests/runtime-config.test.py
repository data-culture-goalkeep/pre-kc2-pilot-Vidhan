#!/usr/bin/env python3
"""Regression tests for deployment-time runtime config generation."""
from __future__ import annotations

import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "frontend" / "scripts" / "render_runtime_config.py"
OUTPUT = ROOT / "frontend" / "dist" / "runtime-config.js"


def run_renderer(**env_overrides: str) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env.pop("SUPABASE_URL", None)
    env.pop("SUPABASE_PUBLISHABLE_KEY", None)
    env.pop("TAMAHAR_PHASE3_WRITES", None)
    env.pop("VERCEL_ENV", None)
    env.update(env_overrides)
    if OUTPUT.exists():
        OUTPUT.unlink()
    return subprocess.run(
        ["python3", str(SCRIPT)],
        cwd=ROOT,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )


def read_output() -> str:
    assert OUTPUT.exists(), "runtime-config.js was not generated"
    return OUTPUT.read_text(encoding="utf-8")


def test_missing_config_is_safe() -> None:
    result = run_renderer()
    assert result.returncode == 0, result.stderr
    rendered = read_output()
    assert 'supabaseUrl: ""' in rendered
    assert 'supabasePublishableKey: ""' in rendered
    assert "SUPABASE_URL" in result.stdout
    assert "SUPABASE_PUBLISHABLE_KEY" in result.stdout


def test_valid_config_is_rendered() -> None:
    result = run_renderer(
        SUPABASE_URL="https://example.supabase.co/",
        SUPABASE_PUBLISHABLE_KEY="sb_publishable_ci_test",
    )
    assert result.returncode == 0, result.stderr
    rendered = read_output()
    assert 'supabaseUrl: "https://example.supabase.co"' in rendered
    assert 'supabasePublishableKey: "sb_publishable_ci_test"' in rendered
    assert "phase3Writes: false" in rendered


def test_phase3_write_gates() -> None:
    local = run_renderer(
        SUPABASE_URL="http://127.0.0.1:54321",
        SUPABASE_PUBLISHABLE_KEY="sb_publishable_local_test",
        TAMAHAR_PHASE3_WRITES="1",
    )
    assert local.returncode == 0, local.stderr
    assert "phase3Writes: true" in read_output()

    production = run_renderer(
        SUPABASE_URL="https://fclinhmjjtpfikyqmssz.supabase.co",
        SUPABASE_PUBLISHABLE_KEY="sb_publishable_ci_test",
        VERCEL_ENV="production",
    )
    assert production.returncode == 0, production.stderr
    assert "phase3Writes: true" in read_output()

    preview = run_renderer(
        SUPABASE_URL="https://fclinhmjjtpfikyqmssz.supabase.co",
        SUPABASE_PUBLISHABLE_KEY="sb_publishable_ci_test",
        VERCEL_ENV="preview",
    )
    assert preview.returncode == 0, preview.stderr
    assert "phase3Writes: false" in read_output()

    unapproved_production = run_renderer(
        SUPABASE_URL="https://example.supabase.co",
        SUPABASE_PUBLISHABLE_KEY="sb_publishable_ci_test",
        VERCEL_ENV="production",
    )
    assert unapproved_production.returncode == 0, unapproved_production.stderr
    assert "phase3Writes: false" in read_output()

    explicit_remote = run_renderer(
        SUPABASE_URL="https://fclinhmjjtpfikyqmssz.supabase.co",
        SUPABASE_PUBLISHABLE_KEY="sb_publishable_ci_test",
        TAMAHAR_PHASE3_WRITES="1",
        VERCEL_ENV="preview",
    )
    assert explicit_remote.returncode != 0
    assert "permitted only for local Supabase" in (explicit_remote.stdout + explicit_remote.stderr)
    assert not OUTPUT.exists()

def test_secret_key_is_rejected() -> None:
    secret = "sb_secret_never_expose"
    result = run_renderer(
        SUPABASE_URL="https://example.supabase.co",
        SUPABASE_PUBLISHABLE_KEY=secret,
    )
    assert result.returncode != 0
    assert "secret/service-role" in (result.stdout + result.stderr)
    assert not OUTPUT.exists()
    assert secret not in (result.stdout + result.stderr)


def main() -> None:
    test_missing_config_is_safe()
    test_valid_config_is_rendered()
    test_phase3_write_gates()
    test_secret_key_is_rejected()
    if OUTPUT.exists():
        OUTPUT.unlink()
    print("runtime-config tests passed")


if __name__ == "__main__":
    main()
