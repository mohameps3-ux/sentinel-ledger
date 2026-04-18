import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import Link from "next/link";
import { ShieldCheck, Bell, Loader2 } from "lucide-react";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { useClientAuthToken } from "../hooks/useClientAuthToken";
import { FinancialDisclaimer } from "../components/layout/FinancialDisclaimer";

const BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "";

export default function ProAlertsPage() {
  const token = useClientAuthToken();
  const [loading, setLoading] = useState(true);
  const [pro, setPro] = useState(false);
  const [settings, setSettings] = useState({
    linked: false,
    enabled: false,
    chatHint: null,
    prefs: null,
    strategies: ["conservative", "balanced", "aggressive"]
  });
  const [toggling, setToggling] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [statusRes, alertRes] = await Promise.all([
        fetch(`${getPublicApiUrl()}/api/v1/user/status`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${getPublicApiUrl()}/api/v1/alerts/settings`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      const statusJson = await statusRes.json().catch(() => ({}));
      const alertJson = await alertRes.json().catch(() => ({}));
      setPro(Boolean(statusJson?.data?.hasProAccess));
      if (alertJson?.ok && alertJson?.data) {
        setSettings({
          linked: alertJson.data.linked,
          enabled: alertJson.data.enabled,
          chatHint: alertJson.data.chatHint,
          prefs: alertJson.data.prefs || null,
          strategies: alertJson.data.strategies || ["conservative", "balanced", "aggressive"]
        });
      }
    } catch (e) {
      toast.error("Could not load alert settings.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (typeof window === "undefined" || !BOT || !token || !pro) return;

    const cbName = "sentinelTelegramAuth";
    window[cbName] = async (user) => {
      try {
        const res = await fetch(`${getPublicApiUrl()}/api/v1/alerts/telegram/auth`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(user)
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) {
          toast.error(json?.error || "Could not link Telegram.");
          return;
        }
        toast.success("Telegram linked — PRO alerts enabled.");
        load();
      } catch (e) {
        toast.error("Telegram link failed.");
      }
    };

    const container = document.getElementById("tg-login-widget");
    if (!container) return;

    container.innerHTML = "";
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", BOT.replace(/^@/, ""));
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "12");
    script.setAttribute("data-onauth", `${cbName}(user)`);
    container.appendChild(script);

    return () => {
      delete window[cbName];
    };
  }, [BOT, token, pro, load]);

  const toggleEnabled = async () => {
    if (!token || !settings.linked) return;
    setToggling(true);
    try {
      const next = !settings.enabled;
      const res = await fetch(`${getPublicApiUrl()}/api/v1/alerts/settings`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ enabled: next })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        toast.error(json?.error || "Update failed.");
        return;
      }
      setSettings((s) => ({ ...s, enabled: next }));
      toast.success(next ? "Alerts ON" : "Alerts OFF");
    } catch (e) {
      toast.error("Could not update.");
    } finally {
      setToggling(false);
    }
  };

  const saveSensitivity = async () => {
    if (!token) return;
    setSavingPrefs(true);
    try {
      const res = await fetch(`${getPublicApiUrl()}/api/v1/alerts/settings`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          strategy: p.strategy,
          direction: p.direction,
          minMovePct: p.minMovePct,
          dedupHours: p.dedupHours
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        toast.error(json?.error || "Could not save.");
        return;
      }
      if (json?.data?.prefs) {
        setSettings((s) => ({ ...s, prefs: json.data.prefs }));
      }
      toast.success("Alert rules saved.");
    } catch (e) {
      toast.error("Save failed.");
    } finally {
      setSavingPrefs(false);
    }
  };

  const defaultPrefs = { strategy: "balanced", minMovePct: 4, direction: "any", dedupHours: 4 };

  const setPref = (key, value) => {
    setSettings((s) => ({
      ...s,
      prefs: { ...(s.prefs || defaultPrefs), [key]: value }
    }));
  };

  const p = settings.prefs ?? defaultPrefs;

  return (
    <div className="sl-container py-8 sm:py-10 md:py-14 max-w-full">
      <section className="glass-card sl-inset">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500/25 to-cyan-500/20 border border-violet-500/25 flex items-center justify-center shrink-0">
            <Bell className="text-violet-200" size={22} />
          </div>
          <div>
            <p className="sl-label mb-1">PRO</p>
            <h1 className="sl-display bg-gradient-to-r from-purple-400 via-violet-300 to-cyan-300 bg-clip-text text-transparent">
              Alert system
            </h1>
            <p className="sl-body sl-muted mt-2 max-w-2xl">
              Telegram when your watchlist moves beyond your threshold (Conservative / Balanced / Aggressive). Not
              financial advice.
            </p>
          </div>
        </div>
      </section>

      <section className="sl-section mt-6">
        <div className="glass-card sl-inset space-y-6">
          {!token ? (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 inline-flex items-start gap-2">
              <ShieldCheck size={18} className="shrink-0 mt-0.5" />
              <span>Connect your wallet and sign in to configure PRO alerts.</span>
            </div>
          ) : null}

          {token && loading ? (
            <div className="flex items-center gap-2 text-gray-400">
              <Loader2 className="animate-spin" size={18} />
              Loading…
            </div>
          ) : null}

          {token && !loading && !pro ? (
            <div className="rounded-xl border border-purple-500/25 bg-purple-500/10 px-4 py-4">
              <p className="text-gray-200 font-medium mb-2">Upgrade to PRO</p>
              <p className="text-sm text-gray-400 mb-4">
                Telegram watchlist alerts are included with an active PRO subscription.
              </p>
              <Link href="/pricing" className="btn-pro inline-flex">
                View pricing
              </Link>
            </div>
          ) : null}

          {token && !loading && pro ? (
            <>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-white">1. Link Telegram</p>
                {!BOT ? (
                  <p className="text-sm text-amber-200">
                    Set <span className="mono text-xs">NEXT_PUBLIC_TELEGRAM_BOT_USERNAME</span> on the frontend (Bot
                    username without @).
                  </p>
                ) : (
                  <p className="text-sm text-gray-400">
                    Use the official widget below (same bot as Sentinel). We never ask for your Telegram password.
                  </p>
                )}
                <div id="tg-login-widget" className="min-h-[44px]" />
                {settings.linked ? (
                  <p className="text-xs text-emerald-300">Linked {settings.chatHint ? `(${settings.chatHint})` : ""}</p>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-6">
                <p className="text-sm font-semibold text-white w-full sm:w-auto">2. Deliveries</p>
                <button
                  type="button"
                  disabled={!settings.linked || toggling}
                  onClick={toggleEnabled}
                  className={`text-sm px-4 py-2 rounded-lg border ${
                    settings.enabled
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                      : "border-white/15 bg-white/5 text-gray-300"
                  } disabled:opacity-40`}
                >
                  {toggling ? "Saving…" : settings.enabled ? "Alerts: ON" : "Alerts: OFF"}
                </button>
                {!settings.linked ? (
                  <span className="text-xs text-gray-500">Link Telegram first.</span>
                ) : null}
              </div>

              {settings.linked ? (
                <div className="space-y-3 border-t border-white/10 pt-6">
                  <p className="text-sm font-semibold text-white">3. Sensitivity &amp; direction</p>
                  <p className="text-xs text-gray-500">
                    Conservative = fewer pings (higher % move). Aggressive = more pings. Direction filters pump-only /
                    dump-only if you want less noise.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block text-xs text-gray-400">
                      Strategy
                      <select
                        value={p.strategy}
                        onChange={(e) => setPref("strategy", e.target.value)}
                        className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
                      >
                        {settings.strategies.map((s) => (
                          <option key={s} value={s}>
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs text-gray-400">
                      Direction filter
                      <select
                        value={p.direction}
                        onChange={(e) => setPref("direction", e.target.value)}
                        className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
                      >
                        <option value="any">Any move</option>
                        <option value="up">Pumps only (↑)</option>
                        <option value="down">Dumps only (↓)</option>
                      </select>
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
                    <span>
                      Resolved: ≥{p.minMovePct}% move · dedup ~{p.dedupHours}h per token
                    </span>
                    <button
                      type="button"
                      onClick={saveSensitivity}
                      disabled={savingPrefs}
                      className="text-sm px-4 py-2 rounded-lg border border-cyan-500/35 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/15 disabled:opacity-50"
                    >
                      {savingPrefs ? "Saving…" : "Save rules"}
                    </button>
                  </div>
                </div>
              ) : null}

              <p className="text-xs text-gray-500">
                Add tokens to your watchlist from token pages — the backend polls DEX/market data on a schedule and
                deduplicates alerts per token.
              </p>
            </>
          ) : null}
        </div>
      </section>

      <section className="mt-10 pb-4 border-t border-gray-800/80 pt-8">
        <FinancialDisclaimer />
      </section>
    </div>
  );
}
