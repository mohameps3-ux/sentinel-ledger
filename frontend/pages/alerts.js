import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import Link from "next/link";
import { ShieldCheck, Bell, Loader2 } from "lucide-react";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { useClientAuthToken } from "../hooks/useClientAuthToken";
import {
  isWebPushEnvironmentSupported,
  getPushSubscriptionInBrowser,
  subscribeWebPush,
  unsubscribeWebPush
} from "../lib/webPushClient";
import { FinancialDisclaimer } from "../components/layout/FinancialDisclaimer";
import { PageHead } from "../components/seo/PageHead";
import { useLocale } from "../contexts/LocaleContext";
import { isProbableSolanaMint } from "../lib/solanaMint.mjs";

const BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "";

function formatDispatchTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  } catch {
    return "—";
  }
}

function tierAbbr(tier) {
  if (tier === "surefire") return "SURE";
  if (tier === "urgent") return "URG";
  return String(tier || "—")
    .slice(0, 4)
    .toUpperCase();
}

export default function ProAlertsPage() {
  const { t } = useLocale();
  const token = useClientAuthToken();
  const [loading, setLoading] = useState(true);
  const [pro, setPro] = useState(false);
  const [settings, setSettings] = useState({
    linked: false,
    enabled: false,
    chatHint: null,
    browserPushCount: 0,
    prefs: null,
    strategies: ["conservative", "balanced", "aggressive"]
  });
  const [toggling, setToggling] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [pushUiBusy, setPushUiBusy] = useState(false);
  const [thisBrowserSubscribed, setThisBrowserSubscribed] = useState(false);
  const [priorityFeed, setPriorityFeed] = useState({
    items: [],
    feedUnavailable: false,
    loaded: false
  });

  const load = useCallback(async () => {
    if (!token) {
      setPriorityFeed({ items: [], feedUnavailable: false, loaded: false });
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
      const isPro = Boolean(statusJson?.data?.hasProAccess);
      setPro(isPro);
      if (alertJson?.ok && alertJson?.data) {
        setSettings({
          linked: alertJson.data.linked,
          enabled: alertJson.data.enabled,
          chatHint: alertJson.data.chatHint,
          browserPushCount: Number(alertJson.data.browserPushCount) || 0,
          prefs: alertJson.data.prefs || null,
          strategies: alertJson.data.strategies || ["conservative", "balanced", "aggressive"]
        });
      }
      if (isPro) {
        try {
          const feedRes = await fetch(`${getPublicApiUrl()}/api/v1/alerts/feed?limit=5`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const feedJson = await feedRes.json().catch(() => ({}));
          if (feedJson?.ok && feedJson?.data) {
            setPriorityFeed({
              items: Array.isArray(feedJson.data.items) ? feedJson.data.items : [],
              feedUnavailable: Boolean(feedJson.data.feedUnavailable),
              loaded: true
            });
          } else {
            setPriorityFeed({ items: [], feedUnavailable: true, loaded: true });
          }
        } catch {
          setPriorityFeed({ items: [], feedUnavailable: true, loaded: true });
        }
      } else {
        setPriorityFeed({ items: [], feedUnavailable: false, loaded: true });
      }
    } catch (e) {
      toast.error(t("alerts.toast.loadError"));
      setPriorityFeed({ items: [], feedUnavailable: true, loaded: true });
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (typeof window === "undefined" || !pro || !token) return;
    (async () => {
      if (!isWebPushEnvironmentSupported()) {
        setThisBrowserSubscribed(false);
        return;
      }
      const sub = await getPushSubscriptionInBrowser();
      setThisBrowserSubscribed(Boolean(sub));
    })();
  }, [pro, token, settings.browserPushCount]);

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
          toast.error(json?.error || t("alerts.toast.linkError"));
          return;
        }
        toast.success(t("alerts.toast.linkedSuccess"));
        load();
      } catch (e) {
        toast.error(t("alerts.toast.telegramFailed"));
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
  }, [BOT, token, pro, load, t]);

  const hasDeliveryChannel =
    settings.linked || (settings.browserPushCount > 0) || thisBrowserSubscribed;

  const onEnableBrowserPush = async () => {
    if (!token) return;
    setPushUiBusy(true);
    try {
      const out = await subscribeWebPush(token);
      if (!out.ok) {
        toast.error(t("alerts.toast.pushError"));
        return;
      }
      setThisBrowserSubscribed(true);
      await load();
      toast.success(t("alerts.toast.pushEnabled"));
    } catch (_e) {
      toast.error(t("alerts.toast.pushError"));
    } finally {
      setPushUiBusy(false);
    }
  };

  const onDisableBrowserPush = async () => {
    if (!token) return;
    setPushUiBusy(true);
    try {
      const out = await unsubscribeWebPush(token);
      if (!out.ok) {
        toast.error(t("alerts.toast.pushError"));
        return;
      }
      setThisBrowserSubscribed(false);
      await load();
      toast.success(t("alerts.toast.pushDisabled"));
    } catch (_e) {
      toast.error(t("alerts.toast.pushError"));
    } finally {
      setPushUiBusy(false);
    }
  };

  const toggleEnabled = async () => {
    if (!token || !hasDeliveryChannel) return;
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
        toast.error(json?.error || t("alerts.toast.updateFailed"));
        return;
      }
      setSettings((s) => ({ ...s, enabled: next }));
      toast.success(next ? t("alerts.toast.alertsOn") : t("alerts.toast.alertsOff"));
    } catch (e) {
      toast.error(t("alerts.toast.couldNotUpdate"));
    } finally {
      setToggling(false);
    }
  };

  const defaultPrefs = { strategy: "balanced", minMovePct: 4, direction: "any", dedupHours: 4, tacticalRegime: false };

  const setPref = (key, value) => {
    setSettings((s) => ({
      ...s,
      prefs: { ...(s.prefs || defaultPrefs), [key]: value }
    }));
  };

  const saveSensitivity = async () => {
    if (!token) return;
    const p = settings.prefs ?? defaultPrefs;
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
          dedupHours: p.dedupHours,
          tacticalRegime: Boolean(p.tacticalRegime)
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        toast.error(json?.error || t("alerts.toast.saveError"));
        return;
      }
      if (json?.data?.prefs) {
        setSettings((s) => ({ ...s, prefs: json.data.prefs }));
      }
      toast.success(t("alerts.toast.rulesSaved"));
    } catch (e) {
      toast.error(t("alerts.toast.saveFailed"));
    } finally {
      setSavingPrefs(false);
    }
  };

  const p = settings.prefs ?? defaultPrefs;
  const canConfigurePrefs = hasDeliveryChannel;

  return (
    <>
      <PageHead title={t("alerts.pageTitle")} description={t("alerts.pageDescription")} />
      <div className="sl-container py-8 sm:py-10 md:py-14 max-w-full">
        <section className="glass-card sl-inset">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500/25 to-cyan-500/20 border border-violet-500/25 flex items-center justify-center shrink-0">
              <Bell className="text-violet-200" size={22} />
            </div>
            <div>
              <p className="sl-label mb-1">{t("alerts.proLabel")}</p>
              <h1 className="sl-display bg-gradient-to-r from-purple-400 via-violet-300 to-cyan-300 bg-clip-text text-transparent">
                {t("alerts.heroTitle")}
              </h1>
              <p className="sl-body sl-muted mt-2 max-w-2xl">{t("alerts.heroBody")}</p>
            </div>
          </div>
        </section>

        {token && pro && priorityFeed.loaded ? (
          <section className="mt-6 border border-white/[0.07] bg-[#08090c] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5 border-b border-white/[0.06]">
              <div>
                <p className="text-[10px] font-semibold tracking-[0.22em] text-gray-500 uppercase">
                  {t("alerts.dispatchTitle")}
                </p>
                <p className="text-[9px] text-gray-600 font-mono mt-0.5">{t("alerts.dispatchSubtitle")}</p>
              </div>
            </div>
            {!priorityFeed.items.length ? (
              <p className="px-4 py-6 text-[11px] text-gray-500 font-mono leading-relaxed">{t("alerts.dispatchEmpty")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left border-collapse">
                  <thead>
                    <tr className="text-[9px] uppercase tracking-[0.14em] text-gray-600 border-b border-white/[0.06]">
                      <th className="px-4 py-2 font-medium w-[7.5rem] whitespace-nowrap">{t("alerts.dispatchColTime")}</th>
                      <th className="px-4 py-2 font-medium w-14 whitespace-nowrap">{t("alerts.dispatchColClass")}</th>
                      <th className="px-4 py-2 font-medium min-w-[12rem]">{t("alerts.dispatchColSubject")}</th>
                      <th className="px-4 py-2 font-medium w-[8.5rem] whitespace-nowrap">{t("alerts.dispatchColRef")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priorityFeed.items.map((row) => {
                      const mint = row.tokenAddress;
                      const ref =
                        mint && isProbableSolanaMint(mint) ? (
                          <Link href={`/token/${mint}`} className="font-mono text-[10px] text-gray-400 hover:text-cyan-200/90">
                            {mint.slice(0, 4)}…{mint.slice(-4)}
                          </Link>
                        ) : (
                          <span className="font-mono text-[10px] text-gray-600">—</span>
                        );
                      const urgent = row.tier === "urgent";
                      return (
                        <tr
                          key={row.id}
                          className="border-b border-white/[0.04] text-[11px] text-gray-300 hover:bg-white/[0.02] transition-colors"
                        >
                          <td className="px-4 py-2.5 align-top font-mono tabular-nums text-gray-500 whitespace-nowrap">
                            {formatDispatchTime(row.createdAt)}
                          </td>
                          <td className="px-4 py-2.5 align-top">
                            <span
                              className={`inline-block font-mono text-[9px] font-semibold tracking-wide px-1.5 py-0.5 border ${
                                urgent
                                  ? "border-amber-500/35 text-amber-100/90 bg-amber-500/[0.07]"
                                  : "border-rose-500/30 text-rose-100/85 bg-rose-500/[0.06]"
                              }`}
                            >
                              {tierAbbr(row.tier)}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 align-top">
                            <p className="text-gray-200 font-medium leading-snug">{row.headline}</p>
                            {row.detail ? (
                              <p className="text-[10px] text-gray-500 font-mono mt-1 leading-snug line-clamp-2">{row.detail}</p>
                            ) : null}
                          </td>
                          <td className="px-4 py-2.5 align-top">{ref}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="px-4 py-2 text-[9px] text-gray-600 font-mono border-t border-white/[0.05] leading-relaxed">
              {t("alerts.dispatchFoot")}
            </p>
          </section>
        ) : null}

        <section className="sl-section mt-6">
          <div className="glass-card sl-inset space-y-6">
            {!token ? (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 inline-flex items-start gap-2">
                <ShieldCheck size={18} className="shrink-0 mt-0.5" />
                <span>{t("alerts.signInPrompt")}</span>
              </div>
            ) : null}

            {token && loading ? (
              <div className="flex items-center gap-2 text-gray-400">
                <Loader2 className="animate-spin" size={18} />
                {t("alerts.loading")}
              </div>
            ) : null}

            {token && !loading && !pro ? (
              <div className="rounded-xl border border-purple-500/25 bg-purple-500/10 px-4 py-4">
                <p className="text-gray-200 font-medium mb-2">{t("alerts.upgradeTitle")}</p>
                <p className="text-sm text-gray-400 mb-4">{t("alerts.upgradeBody")}</p>
                <Link href="/pricing" className="btn-pro inline-flex">
                  {t("alerts.viewPricing")}
                </Link>
              </div>
            ) : null}

            {token && !loading && pro ? (
              <>
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-white">{t("alerts.step1Title")}</p>
                  {!BOT ? (
                    <p className="text-sm text-amber-200 leading-relaxed">
                      {t("alerts.botEnvHint")}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400">{t("alerts.widgetHint")}</p>
                  )}
                  <div id="tg-login-widget" className="min-h-[44px]" />
                  {settings.linked ? (
                    <p className="text-xs text-emerald-300">
                      {t("alerts.linkedPrefix")}
                      {settings.chatHint ? ` (${settings.chatHint})` : ""}
                    </p>
                  ) : null}
                </div>

                {isWebPushEnvironmentSupported() ? (
                  <div className="space-y-2 border-t border-white/10 pt-6">
                    <p className="text-sm font-semibold text-white">{t("alerts.browserSectionTitle")}</p>
                    <p className="text-xs text-gray-500">{t("alerts.browserSectionBody")}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {!thisBrowserSubscribed ? (
                        <button
                          type="button"
                          disabled={pushUiBusy}
                          onClick={onEnableBrowserPush}
                          className="text-sm px-4 py-2 rounded-lg border border-violet-500/35 bg-violet-500/10 text-violet-200 hover:bg-violet-500/15 disabled:opacity-50"
                        >
                          {pushUiBusy ? t("alerts.saving") : t("alerts.enableBrowserPush")}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={pushUiBusy}
                          onClick={onDisableBrowserPush}
                          className="text-sm px-4 py-2 rounded-lg border border-white/20 bg-white/5 text-gray-200 hover:bg-white/10 disabled:opacity-50"
                        >
                          {pushUiBusy ? t("alerts.saving") : t("alerts.disableBrowserPush")}
                        </button>
                      )}
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-6">
                  <p className="text-sm font-semibold text-white w-full sm:w-auto">{t("alerts.step2Title")}</p>
                  <button
                    type="button"
                    disabled={!hasDeliveryChannel || toggling}
                    onClick={toggleEnabled}
                    className={`text-sm px-4 py-2 rounded-lg border ${
                      settings.enabled
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                        : "border-white/15 bg-white/5 text-gray-300"
                    } disabled:opacity-40`}
                  >
                    {toggling ? t("alerts.saving") : settings.enabled ? t("alerts.alertsOnBtn") : t("alerts.alertsOffBtn")}
                  </button>
                  {!hasDeliveryChannel ? <span className="text-xs text-gray-500">{t("alerts.deliveryOrBrowser")}</span> : null}
                </div>

                {canConfigurePrefs ? (
                  <div className="space-y-3 border-t border-white/10 pt-6">
                    <p className="text-sm font-semibold text-white">{t("alerts.step3Title")}</p>
                    <p className="text-xs text-gray-500">{t("alerts.sensitivityHelp")}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="block text-xs text-gray-400">
                        {t("alerts.labelStrategy")}
                        <select
                          value={p.strategy}
                          onChange={(e) => setPref("strategy", e.target.value)}
                          className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
                        >
                          {settings.strategies.map((s) => (
                            <option key={s} value={s}>
                              {t(`alerts.strategy.${s}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-xs text-gray-400">
                        {t("alerts.labelDirection")}
                        <select
                          value={p.direction}
                          onChange={(e) => setPref("direction", e.target.value)}
                          className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white"
                        >
                          <option value="any">{t("alerts.directionAny")}</option>
                          <option value="up">{t("alerts.directionUp")}</option>
                          <option value="down">{t("alerts.directionDown")}</option>
                        </select>
                      </label>
                    </div>
                    <label className="flex items-start gap-2 text-xs text-gray-300">
                      <input
                        type="checkbox"
                        className="mt-0.5 rounded border-white/20"
                        checked={Boolean(p.tacticalRegime)}
                        onChange={(e) => setPref("tacticalRegime", e.target.checked)}
                      />
                      <span>
                        <span className="block text-gray-200 font-medium">{t("alerts.tacticalRegimeLabel")}</span>
                        <span className="block text-gray-500 mt-0.5">{t("alerts.tacticalRegimeHelp")}</span>
                      </span>
                    </label>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
                      <span>
                        {t("alerts.resolvedLine", { minMovePct: p.minMovePct, dedupHours: p.dedupHours })}
                      </span>
                      <button
                        type="button"
                        onClick={saveSensitivity}
                        disabled={savingPrefs}
                        className="text-sm px-4 py-2 rounded-lg border border-cyan-500/35 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/15 disabled:opacity-50"
                      >
                        {savingPrefs ? t("alerts.saving") : t("alerts.saveRules")}
                      </button>
                    </div>
                  </div>
                ) : null}

                <p className="text-xs text-gray-500">{t("alerts.footerHint")}</p>
              </>
            ) : null}
          </div>
        </section>

        <section className="mt-10 pb-4 border-t border-gray-800/80 pt-8">
          <FinancialDisclaimer />
        </section>
      </div>
    </>
  );
}
