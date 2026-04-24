import { useEffect, useState } from "react";
import Link from "next/link";
import { getPublicApiUrl } from "../../lib/publicRuntime";
import { recordClientTelemetry } from "../../lib/clientTelemetry.mjs";

/**
 * Fixed strip pinned directly under the navbar (home only). Reads public
 * sync health so the home HUD shows measured freshness instead of mock motion.
 *
 * Layout contract
 * ---------------
 * This component participates in the site-wide "fixed chrome" layout
 * skeleton driven by CSS variables (see :root in globals.css):
 *
 *   - It positions itself at `top: var(--sl-nav-h)` so it always sits
 *     exactly under the navbar regardless of the navbar's height at the
 *     current breakpoint. No more `top-16`/`top-12` magic numbers drifting
 *     when the navbar changes.
 *
 *   - While mounted it tags <html data-has-tension-bar="1">, which the
 *     stylesheet reads to lift `--sl-bar-h` from 0 to the bar's real
 *     per-breakpoint height. <main>'s padding-top is computed from
 *     (--sl-nav-h + --sl-bar-h + --sl-safe-gap), so content always clears
 *     the bar with a consistent gap and *no code in _app.jsx needs to
 *     know whether this bar exists*. Unmount removes the flag; padding
 *     shrinks automatically.
 *
 * If the bar grows or changes layout in the future, only the
 * `--sl-bar-h` numbers in globals.css need updating — a single source
 * of truth.
 */
export function LiveTensionBar() {
  const [freshness, setFreshness] = useState({ state: "STALE", label: "Checking freshness", hint: "measuring" });

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`${getPublicApiUrl()}/health/sync`, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) throw new Error("sync_health_failed");
        const measuredAt = Number(json.measuredAt || Date.now());
        const ageMs = Math.max(0, Date.now() - measuredAt);
        const marketDegraded = json.services?.market_data === "degraded";
        const state = marketDegraded || json.status === "DEGRADED" ? "DEGRADED" : ageMs > 60_000 ? "STALE" : "LIVE";
        const realSignals = Math.round(Number(json.dataFreshness?.signalsLatest?.realRatio24h || 0) * 100);
        const realHot = Math.round(Number(json.dataFreshness?.tokensHot?.realRatio24h || 0) * 100);
        setFreshness({
          state,
          label: state === "LIVE" ? "Live" : state === "STALE" ? "Stale" : "Degraded",
          hint: `signals ${realSignals}% real · hot ${realHot}% real`,
          ageSec: Math.round(ageMs / 1000)
        });
        recordClientTelemetry("freshness_state", { path: "/", state, ageMs });
      } catch {
        if (!alive) return;
        setFreshness({ state: "DEGRADED", label: "Degraded", hint: "health unavailable" });
        recordClientTelemetry("freshness_state", { path: "/", state: "DEGRADED" });
      }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Publish presence to the layout system. We use a dataset attribute
  // (reversible, lives on <html> so media queries can key on it) rather
  // than inline-mutating CSS variables, so SSR stays pure and cleanup
  // is a single delete.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.hasTensionBar = "1";
    return () => {
      delete document.documentElement.dataset.hasTensionBar;
    };
  }, []);

  const tone =
    freshness.state === "LIVE"
      ? "bg-emerald-400 text-emerald-200 border-emerald-500/25"
      : freshness.state === "STALE"
        ? "bg-amber-400 text-amber-200 border-amber-500/25"
        : "bg-red-400 text-red-200 border-red-500/25";

  return (
    <div
      className="fixed left-0 right-0 z-40 border-b border-emerald-500/25 bg-[#040508]/95 backdrop-blur-md shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
      style={{ top: "var(--sl-nav-actual, var(--sl-nav-h))" }}
      role="status"
      aria-live="polite"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2 sm:gap-3 text-[11px] sm:text-xs font-medium text-gray-200">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
          <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
            {freshness.state === "LIVE" ? (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70" />
            ) : null}
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${tone.split(" ")[0]} shadow-[0_0_10px_rgba(52,211,153,0.45)]`} />
          </span>
          <span className={`tracking-wide uppercase shrink-0 ${tone.split(" ")[1]}`}>
            {freshness.label} feed
          </span>
          <span className="text-gray-600 hidden sm:inline">|</span>
          <span className="text-gray-300">{freshness.hint}</span>
          <span className="text-gray-600 hidden sm:inline">|</span>
          <span className="text-gray-300 inline-flex items-center gap-1 font-mono tabular-nums">
            {freshness.ageSec != null ? `age ${freshness.ageSec}s` : "age n/a"}
          </span>
        </div>
        <Link
          href="/pricing"
          className="shrink-0 inline-flex items-center justify-center rounded-lg border border-purple-500/45 bg-purple-500/12 px-3 py-1.5 text-[11px] font-semibold text-purple-100 hover:bg-purple-500/22 hover:border-purple-400/55 transition whitespace-nowrap"
        >
          🔒 Unlock PRO →
        </Link>
      </div>
    </div>
  );
}
