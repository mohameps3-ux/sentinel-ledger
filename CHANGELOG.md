# Changelog

## 2026-04-21
- backend: `signals/latest` now guarantees non-empty output via layered fallback (`supabase` -> `dexscreener_fallback` -> `static_fallback`).
- backend: bumped cache keys to `signals/latest` v3 (`fallback` v2) to avoid serving stale empty payloads.
- backend: added controlled simulation toggle `HOME_TERMINAL_FORCE_STATIC_FALLBACK=true` to validate failover behavior safely.
