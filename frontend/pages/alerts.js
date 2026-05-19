import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import Link from "next/link";
import {
  Bell,
  BellRing,
  ExternalLink,
  Loader2,
  LockKeyhole,
  RadioTower,
  Save,
  Send,
  Settings2,
  Smartphone,
  ToggleLeft,
  ToggleRight,
  Zap
} from "lucide-react";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { useClientAuthToken } from "../hooks/useClientAuthToken";
import {
  isWebPushEnvironmentSupported,
  getPushSubscriptionInBrowser,
  subscribeWebPush,
  unsubscribeWebPush
} from "../lib/webPushClient";
import { FinancialDisclaimer } from "../components/layout/FinancialDisclaimer";
import { ProPurchaseButton } from "../components/subscription/ProPurchaseButton";
import { useLocale } from "../contexts/LocaleContext";
import { isProbableSolanaMint } from "../lib/solanaMint.mjs";
import { InstitutionalPage, InstitutionalCard } from "../components/institutional";

const BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "";

function formatDispatchTime(iso) {
  if (!iso) return "-";
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
    return "-";
  }
}

function tierAbbr(tier) {
  if (tier === "surefire") return "SURE";
  if (tier === "urgent") return "URG";
  return String(tier || "-").slice(0, 4).toUpperCase();
}

function alertAccent(tier) {
  if (tier === "surefire" || tier === "urgent") return "#DC2626";
  if (tier === "tactical") return "#F59E0B";
  return "#3B82F6";
}

function alertTone(tier) {
  if (tier === "surefire" || tier === "urgent") return "border-rose-300/35 bg-rose-300/10 text-rose-100";
  if (tier === "tactical") return "border-amber-300/35 bg-amber-300/10 text-amber-100";
  return "border-sky-300/25 bg-sky-300/10 text-sky-100";
}

function OpsMetric({ label, value, sub, tone = "neutral" }) {
  const toneClass =
    tone === "live"
      ? "text-emerald-200"
      : tone === "warn"
        ? "text-amber-200"
        : tone === "risk"
          ? "text-rose-200"
          : "text-zinc-100";
  return (
    <div className="min-w-0 border border-white/[0.08] bg-white/[0.025] px-3 py-3">
      <p className="truncate font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <p className={`mt-2 truncate font-mono text-xl font-semibold tabular-nums leading-none ${toneClass}`}>{value}</p>
      {sub ? <p className="mt-1 truncate text-[11px] text-zinc-600">{sub}</p> : null}
    </div>
  );
}

function StatusPill({ active, children }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${
        active
          ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100"
          : "border-zinc-500/25 bg-zinc-500/10 text-zinc-300"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-300" : "bg-zinc-500"}`} />
      {children}
    </span>
  );
}

function TerminalButton({ children, active, disabled, onClick, icon: Icon }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`mt-3 inline-flex h-9 items-center justify-center gap-2 border px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] transition ${
        active
          ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/15"
          : "border-white/[0.1] bg-white/[0.035] text-zinc-300 hover:border-cyan-300/35 hover:bg-cyan-300/10 hover:text-cyan-100"
      } disabled:pointer-events-none disabled:opacity-40`}
    >
      {Icon ? <Icon size={14} className={Icon === Loader2 ? "animate-spin" : ""} /> : null}
      {children}
    </button>
  );
}

function DeliveryRailItem({ icon: Icon, title, body, active, children }) {
  return (
    <div className="border border-white/[0.08] bg-black/20 p-3">
      <div className="flex items-start gap-3">
        <div
          className={`grid h-9 w-9 shrink-0 place-items-center border ${
            active ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100" : "border-white/[0.08] bg-white/[0.035] text-zinc-400"
          }`}
        >
          <Icon size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-zinc-100">{title}</p>
            <StatusPill active={active}>{active ? "LIVE" : "OFF"}</StatusPill>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">{body}</p>
          {children ? <div className="mt-3">{children}</div> : null}
        </div>
      </div>
    </div>
  );
}

function SelectField({ label, value, onChange, children }) {
  return (
    <label className="block text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-500">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 h-10 w-full border border-white/[0.1] bg-[#07090d] px-3 text-sm normal-case tracking-normal text-zinc-100 outline-none focus:border-cyan-300/35"
      >
        {children}
      </select>
    </label>
  );
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
    script.setAttribute("data-radius", "8");
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
  const liveCount = priorityFeed.items.length;
  const deliveryCount = Number(settings.linked ? 1 : 0) + Number((settings.browserPushCount > 0) || thisBrowserSubscribed ? 1 : 0);
  const routingState = !token ? "SIGNED OUT" : loading ? "SYNCING" : pro ? (settings.enabled ? "ARMED" : "STANDBY") : "LOCKED";

  return (
    <InstitutionalPage
      trackerLabel="ALERTS / PRO ROUTING"
      title={t("alerts.heroTitle")}
      subtitle={t("alerts.heroBody")}
      pageHeadTitle={t("alerts.pageTitle")}
      pageHeadDescription={t("alerts.pageDescription")}
      width="wide"
      actions={
        <div className="flex items-center gap-2 border border-white/[0.08] bg-white/[0.035] px-3 py-2">
          <RadioTower className={settings.enabled ? "text-emerald-200" : "text-zinc-500"} size={16} />
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-300">{routingState}</span>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <OpsMetric label="Routing state" value={routingState} sub={settings.enabled ? "Dispatch layer active" : "Awaiting arming"} tone={settings.enabled ? "live" : "neutral"} />
          <OpsMetric label="Live alerts" value={String(liveCount)} sub={priorityFeed.feedUnavailable ? "Feed degraded" : "Latest priority feed"} tone={priorityFeed.feedUnavailable ? "warn" : "neutral"} />
          <OpsMetric label="Channels" value={String(deliveryCount)} sub={hasDeliveryChannel ? "Delivery path ready" : "No route attached"} tone={hasDeliveryChannel ? "live" : "warn"} />
          <OpsMetric label="Sensitivity" value={`${p.minMovePct}%`} sub={`${p.dedupHours}h dedupe window`} tone="neutral" />
        </div>

        {!token ? (
          <InstitutionalCard tone="warn">
            <div className="flex items-start gap-3">
              <LockKeyhole size={18} className="mt-0.5 shrink-0 text-amber-200" />
              <p className="text-sm leading-relaxed text-amber-100">{t("alerts.signInPrompt")}</p>
            </div>
          </InstitutionalCard>
        ) : null}

        {token && loading ? (
          <InstitutionalCard>
            <div className="flex items-center gap-3 text-sm text-zinc-300">
              <Loader2 className="animate-spin text-cyan-200" size={18} />
              {t("alerts.loading")}
            </div>
          </InstitutionalCard>
        ) : null}

        {token && !loading && !pro ? (
          <InstitutionalCard tone="warn">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-base font-semibold text-zinc-100">{t("alerts.upgradeTitle")}</p>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-400">{t("alerts.upgradeBody")}</p>
              </div>
              <ProPurchaseButton className="inline-flex h-9 w-fit items-center justify-center gap-2 border border-amber-300/30 bg-amber-300/10 px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-amber-100 no-underline">
                {t("alerts.viewPricing")}
                <ExternalLink size={14} />
              </ProPurchaseButton>
            </div>
          </InstitutionalCard>
        ) : null}

        {token && !loading && pro ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-5">
              <InstitutionalCard padded={false} className="overflow-hidden">
                <div className="border-b border-white/[0.08] bg-white/[0.025] px-4 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">01 / Priority tape</p>
                      <h2 className="mt-1 text-lg font-semibold tracking-tight text-zinc-50">Active alerts feed</h2>
                      <p className="mt-1 text-xs text-zinc-500">{t("alerts.dispatchSubtitle")}</p>
                    </div>
                    <StatusPill active={!priorityFeed.feedUnavailable}>{priorityFeed.feedUnavailable ? "DEGRADED" : "SYNCED"}</StatusPill>
                  </div>
                </div>

                {!priorityFeed.items.length ? (
                  <div className="grid min-h-[300px] place-items-center px-4 py-12 text-center">
                    <div>
                      <div className="mx-auto grid h-12 w-12 place-items-center border border-white/[0.1] bg-white/[0.035] text-zinc-400">
                        <Bell size={20} />
                      </div>
                      <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-300">No active alerts</p>
                      <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-500">
                        Set your routing, arm delivery, and this tape will show the alerts that pass your rules.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.06]">
                    {priorityFeed.items.map((row) => {
                      const mint = row.tokenAddress;
                      const accent = alertAccent(row.tier);
                      return (
                        <div key={row.id} className="group grid gap-3 px-4 py-4 transition hover:bg-white/[0.025] lg:grid-cols-[72px_minmax(0,1fr)_130px]">
                          <div>
                            <span
                              className={`inline-flex min-w-14 justify-center border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] ${alertTone(row.tier)}`}
                              style={{ boxShadow: `inset 3px 0 0 ${accent}` }}
                            >
                              {tierAbbr(row.tier)}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold leading-snug text-zinc-100">{row.headline}</p>
                            {row.detail ? <p className="mt-1 text-xs leading-relaxed text-zinc-500">{row.detail}</p> : null}
                            {mint ? <p className="mt-2 truncate font-mono text-[10px] text-zinc-600">{mint}</p> : null}
                          </div>
                          <div className="flex items-center justify-between gap-3 lg:block lg:text-right">
                            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">{formatDispatchTime(row.createdAt)}</p>
                            {mint && isProbableSolanaMint(mint) ? (
                              <Link
                                href={`/token/${mint}`}
                                className="mt-0 inline-flex h-8 items-center justify-center gap-2 border border-cyan-300/25 bg-cyan-300/10 px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-cyan-100 no-underline lg:mt-3"
                              >
                                Open
                                <ExternalLink size={13} />
                              </Link>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="border-t border-white/[0.06] bg-black/20 px-4 py-2 font-mono text-[9px] leading-relaxed text-zinc-600">
                  {t("alerts.dispatchFoot")}
                </p>
              </InstitutionalCard>

              <FinancialDisclaimer />
            </div>

            <aside className="space-y-5">
              <InstitutionalCard padded={false} className="overflow-hidden">
                <div className="border-b border-white/[0.08] bg-white/[0.025] px-4 py-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">02 / Delivery</p>
                  <h2 className="mt-1 text-lg font-semibold tracking-tight text-zinc-50">Routing console</h2>
                </div>
                <div className="space-y-3 p-3">
                  <DeliveryRailItem
                    icon={Send}
                    title={t("alerts.step1Title")}
                    body={!BOT ? t("alerts.botEnvHint") : t("alerts.widgetHint")}
                    active={settings.linked}
                  >
                    <div id="tg-login-widget" className="min-h-[44px]" />
                    {settings.linked ? (
                      <p className="mt-2 text-xs text-emerald-300">
                        {t("alerts.linkedPrefix")}
                        {settings.chatHint ? ` (${settings.chatHint})` : ""}
                      </p>
                    ) : null}
                  </DeliveryRailItem>

                  {isWebPushEnvironmentSupported() ? (
                    <DeliveryRailItem
                      icon={Smartphone}
                      title={t("alerts.browserSectionTitle")}
                      body={t("alerts.browserSectionBody")}
                      active={thisBrowserSubscribed || settings.browserPushCount > 0}
                    >
                      {!thisBrowserSubscribed ? (
                        <TerminalButton disabled={pushUiBusy} onClick={onEnableBrowserPush} icon={BellRing}>
                          {pushUiBusy ? t("alerts.saving") : t("alerts.enableBrowserPush")}
                        </TerminalButton>
                      ) : (
                        <TerminalButton active disabled={pushUiBusy} onClick={onDisableBrowserPush} icon={Bell}>
                          {pushUiBusy ? t("alerts.saving") : t("alerts.disableBrowserPush")}
                        </TerminalButton>
                      )}
                    </DeliveryRailItem>
                  ) : null}

                  <div className="border border-white/[0.08] bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-zinc-100">{t("alerts.step2Title")}</p>
                        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                          {!hasDeliveryChannel ? t("alerts.deliveryOrBrowser") : t("alerts.footerHint")}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={!hasDeliveryChannel || toggling}
                        onClick={toggleEnabled}
                        className={`grid h-10 w-10 shrink-0 place-items-center border transition ${
                          settings.enabled
                            ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100"
                            : "border-white/[0.1] bg-white/[0.035] text-zinc-400"
                        } disabled:pointer-events-none disabled:opacity-40`}
                        title={settings.enabled ? t("alerts.alertsOnBtn") : t("alerts.alertsOffBtn")}
                      >
                        {toggling ? <Loader2 className="animate-spin" size={17} /> : settings.enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                      </button>
                    </div>
                  </div>
                </div>
              </InstitutionalCard>

              {canConfigurePrefs ? (
                <InstitutionalCard padded={false} className="overflow-hidden">
                  <div className="border-b border-white/[0.08] bg-white/[0.025] px-4 py-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">03 / Rules</p>
                    <h2 className="mt-1 text-lg font-semibold tracking-tight text-zinc-50">{t("alerts.step3Title")}</h2>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-500">{t("alerts.sensitivityHelp")}</p>
                  </div>
                  <div className="space-y-4 p-4">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                      <SelectField label={t("alerts.labelStrategy")} value={p.strategy} onChange={(value) => setPref("strategy", value)}>
                        {settings.strategies.map((s) => (
                          <option key={s} value={s}>
                            {t(`alerts.strategy.${s}`)}
                          </option>
                        ))}
                      </SelectField>
                      <SelectField label={t("alerts.labelDirection")} value={p.direction} onChange={(value) => setPref("direction", value)}>
                        <option value="any">{t("alerts.directionAny")}</option>
                        <option value="up">{t("alerts.directionUp")}</option>
                        <option value="down">{t("alerts.directionDown")}</option>
                      </SelectField>
                    </div>

                    <label className="block">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Move threshold</span>
                        <span className="font-mono text-sm text-zinc-100">{p.minMovePct}%</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="25"
                        value={Number(p.minMovePct) || 4}
                        onChange={(e) => setPref("minMovePct", Number(e.target.value))}
                        className="mt-2 w-full accent-cyan-300"
                      />
                    </label>

                    <label className="block">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Dedupe window</span>
                        <span className="font-mono text-sm text-zinc-100">{p.dedupHours}h</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="24"
                        value={Number(p.dedupHours) || 4}
                        onChange={(e) => setPref("dedupHours", Number(e.target.value))}
                        className="mt-2 w-full accent-amber-300"
                      />
                    </label>

                    <label className="flex items-start gap-3 border border-white/[0.08] bg-black/20 p-3 text-xs text-zinc-400">
                      <input
                        type="checkbox"
                        className="mt-0.5 accent-emerald-300"
                        checked={Boolean(p.tacticalRegime)}
                        onChange={(e) => setPref("tacticalRegime", e.target.checked)}
                      />
                      <span>
                        <span className="block font-semibold text-zinc-200">{t("alerts.tacticalRegimeLabel")}</span>
                        <span className="mt-0.5 block leading-relaxed text-zinc-500">{t("alerts.tacticalRegimeHelp")}</span>
                      </span>
                    </label>

                    <div className="border border-white/[0.08] bg-white/[0.025] p-3">
                      <div className="flex items-start gap-2 text-xs text-zinc-400">
                        <Settings2 size={15} className="mt-0.5 shrink-0 text-zinc-500" />
                        <span>{t("alerts.resolvedLine", { minMovePct: p.minMovePct, dedupHours: p.dedupHours })}</span>
                      </div>
                      <TerminalButton disabled={savingPrefs} onClick={saveSensitivity} icon={savingPrefs ? Loader2 : Save}>
                        {savingPrefs ? t("alerts.saving") : t("alerts.saveRules")}
                      </TerminalButton>
                    </div>
                  </div>
                </InstitutionalCard>
              ) : (
                <InstitutionalCard>
                  <div className="flex items-start gap-3 text-sm text-zinc-400">
                    <Zap size={17} className="mt-0.5 shrink-0 text-amber-200" />
                    <p>{t("alerts.deliveryOrBrowser")}</p>
                  </div>
                </InstitutionalCard>
              )}
            </aside>
          </div>
        ) : null}
      </div>
    </InstitutionalPage>
  );
}
