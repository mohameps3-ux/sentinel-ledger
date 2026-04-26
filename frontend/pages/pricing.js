import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import toast from "react-hot-toast";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { useClientAuthToken } from "../hooks/useClientAuthToken";
import { FinancialDisclaimer } from "../components/layout/FinancialDisclaimer";
import { PageHead } from "../components/seo/PageHead";
import { useLocale } from "../contexts/LocaleContext";

function Cell({ v, ariaIncluded, ariaNotIncluded }) {
  if (v === true) return <span className="text-sl-green font-bold" aria-label={ariaIncluded}>✓</span>;
  if (v === false) return <span className="text-sl-red" aria-label={ariaNotIncluded}>✗</span>;
  return <span className="text-xs text-gray-300 font-mono">{v}</span>;
}

export default function PricingPage() {
  const { t } = useLocale();
  const token = useClientAuthToken();
  const router = useRouter();
  const [loadingPlan, setLoadingPlan] = useState("");
  const [mounted, setMounted] = useState(false);
  const success = useMemo(() => router.query.success === "true", [router.query.success]);
  const canceled = useMemo(() => router.query.canceled === "true", [router.query.canceled]);

  const plans = useMemo(
    () => [
      {
        id: "pro",
        title: t("pricing.plan.pro.title"),
        priceLine: t("pricing.plan.pro.price"),
        blurb: t("pricing.plan.pro.blurb"),
        points: [t("pricing.plan.pro.p1"), t("pricing.plan.pro.p2"), t("pricing.plan.pro.p3")]
      },
      {
        id: "super_pro",
        title: t("pricing.plan.super.title"),
        priceLine: t("pricing.plan.super.price"),
        blurb: t("pricing.plan.super.blurb"),
        points: [
          t("pricing.plan.super.p1"),
          t("pricing.plan.super.p2"),
          t("pricing.plan.super.p3"),
          t("pricing.plan.super.p4")
        ],
        highlight: true
      },
      {
        id: "lifetime",
        title: t("pricing.plan.life.title"),
        priceLine: t("pricing.plan.life.price"),
        blurb: t("pricing.plan.life.blurb"),
        points: [t("pricing.plan.life.p1"), t("pricing.plan.life.p2"), t("pricing.plan.life.p3")]
      }
    ],
    [t]
  );

  const featureRows = useMemo(
    () => [
      { feature: t("pricing.feat.tg"), pro: true, superPro: true, lifetime: true },
      { feature: t("pricing.feat.sm"), pro: true, superPro: true, lifetime: true },
      {
        feature: t("pricing.feat.depth"),
        pro: t("pricing.val.24h"),
        superPro: t("pricing.val.extended"),
        lifetime: t("pricing.val.extended")
      },
      {
        feature: t("pricing.feat.api"),
        pro: t("pricing.val.standard"),
        superPro: t("pricing.val.priority"),
        lifetime: t("pricing.val.priority")
      },
      {
        feature: t("pricing.feat.quotas"),
        pro: t("pricing.val.standard"),
        superPro: t("pricing.val.higher"),
        lifetime: t("pricing.val.higher")
      },
      {
        feature: t("pricing.feat.billing"),
        pro: t("pricing.val.monthly"),
        superPro: t("pricing.val.monthly"),
        lifetime: t("pricing.val.oneTime")
      }
    ],
    [t]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  const effectiveToken = useMemo(() => {
    if (typeof window === "undefined") return null;
    return token || localStorage.getItem("token");
  }, [token]);

  const canCheckout = Boolean(effectiveToken);

  useEffect(() => {
    if (!router.isReady) return;
    if (success) {
      toast.success(t("pricing.toast.paymentOk"));
    }
    if (canceled) {
      toast(t("pricing.toast.canceled"));
    }
  }, [router.isReady, success, canceled, t]);

  const [portalLoading, setPortalLoading] = useState(false);

  const openBillingPortal = async () => {
    if (!effectiveToken) {
      toast.error(t("pricing.toast.connectWallet"));
      return;
    }
    try {
      setPortalLoading(true);
      const res = await fetch(`${getPublicApiUrl()}/api/v1/create-portal-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${effectiveToken}`
        }
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok || !json?.url) {
        throw new Error(json?.error || "portal_failed");
      }
      window.location.href = json.url;
    } catch (e) {
      toast.error(e.message || t("pricing.toast.portalFail"));
    } finally {
      setPortalLoading(false);
    }
  };

  const startCheckout = async (plan) => {
    if (!effectiveToken) {
      toast.error(t("pricing.toast.connectWallet"));
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      setLoadingPlan(plan);
      const res = await fetch(`${getPublicApiUrl()}/api/v1/create-checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${effectiveToken}`
        },
        body: JSON.stringify({ plan }),
        signal: controller.signal
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok || !json?.url) {
        const message =
          json?.error === "invalid_price_configuration" ? t("pricing.toast.invalidPrice") : json?.error || "checkout_failed";
        throw new Error(message);
      }
      window.location.href = json.url;
    } catch (error) {
      const message =
        error?.name === "AbortError" ? t("pricing.toast.checkoutTimeout") : error.message;
      toast.error(t("pricing.toast.checkoutFail", { msg: message }));
    } finally {
      clearTimeout(timeout);
      setLoadingPlan("");
    }
  };

  return (
    <>
      <PageHead title={t("pricing.pageTitle")} description={t("pricing.pageDesc")} />
      <div className="sl-container py-8 sm:py-10 md:py-14 max-w-full space-y-8">
        <section className="px-6 py-8 text-center mb-8">
          <span className="section-title">PRICING</span>
          <h1 className="font-display text-3xl font-bold text-sl-text mt-2">
            Choose Your Intelligence Level
          </h1>
          <p className="font-ui text-sm text-sl-muted mt-2 max-w-md mx-auto">
            Professional Solana trading intelligence. Cancel anytime.
          </p>
        </section>

        {mounted && !canCheckout ? (
          <div
            className="border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
            role="status"
          >
            <strong className="text-amber-50">{t("pricing.walletBannerTitle")}</strong> {t("pricing.walletBannerBody")}
          </div>
        ) : null}

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl mx-auto px-4">
          {plans.map((plan, idx) => {
            const isPrimary = Boolean(plan.highlight);
            const ctaClass = idx === 0 ? "btn-ghost mt-auto w-full" : isPrimary ? "btn-primary mt-auto w-full" : "btn-outline mt-auto w-full";
            return (
            <div
              key={plan.id}
              className={`terminal-panel p-6 flex flex-col gap-4 relative overflow-hidden ${
                isPrimary ? "border-sl-violet border" : ""
              }`}
            >
              {isPrimary ? (
                <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-violet-500 via-cyan-400 to-emerald-400" />
              ) : null}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="section-title">{plan.title}</span>
                  {isPrimary ? <span className="badge-pro">POPULAR</span> : null}
                </div>
                <span className="font-display text-3xl font-bold text-sl-text">{plan.priceLine}</span>
                <p className="font-mono text-2xs text-sl-muted mb-6 mt-2">{plan.blurb}</p>
              </div>
              <ul className="text-sm text-gray-300 space-y-1.5 flex-1">
                {plan.points.map((point) => (
                  <li key={point} className="flex gap-2">
                    <span className="text-sl-green font-bold shrink-0 mt-0.5">✓</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => startCheckout(plan.id)}
                disabled={!mounted || loadingPlan === plan.id || !canCheckout}
                title={!canCheckout ? t("pricing.btn.checkoutTitle") : undefined}
                className={`${ctaClass} justify-center disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {loadingPlan === plan.id ? t("pricing.btn.redirecting") : t("pricing.btn.checkout")}
              </button>
            </div>
          );})}
        </section>

        <section className="terminal-panel max-w-5xl mx-auto mt-8 mx-4 overflow-x-auto">
          <div className="panel-header">
            <span className="section-title">FEATURE COMPARISON</span>
          </div>
          <table className="data-table min-w-[640px]">
            <thead>
              <tr>
                <th className="data-th">{t("pricing.matrix.th.cap")}</th>
                <th className="data-th text-center">{t("pricing.matrix.th.pro")}</th>
                <th className="data-th text-center">{t("pricing.matrix.th.super")}</th>
                <th className="data-th text-center">{t("pricing.matrix.th.life")}</th>
              </tr>
            </thead>
            <tbody>
              {featureRows.map((row) => (
                <tr key={row.feature} className="feed-row">
                  <td className="data-td">{row.feature}</td>
                  <td className="data-td text-center">
                    <Cell v={row.pro} ariaIncluded={t("pricing.aria.included")} ariaNotIncluded={t("pricing.aria.notIncluded")} />
                  </td>
                  <td className="data-td text-center">
                    <Cell v={row.superPro} ariaIncluded={t("pricing.aria.included")} ariaNotIncluded={t("pricing.aria.notIncluded")} />
                  </td>
                  <td className="data-td text-center">
                    <Cell v={row.lifetime} ariaIncluded={t("pricing.aria.included")} ariaNotIncluded={t("pricing.aria.notIncluded")} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <p className="text-xs text-gray-500">{t("pricing.footnote")}</p>

        {mounted && canCheckout ? (
          <div className="terminal-panel px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-white">{t("pricing.portal.title")}</p>
              <p className="text-xs text-gray-400 mt-1">{t("pricing.portal.sub")}</p>
            </div>
            <button
              type="button"
              onClick={openBillingPortal}
              disabled={portalLoading}
              className="btn-ghost-sm shrink-0 disabled:opacity-50"
            >
              {portalLoading ? t("pricing.portal.opening") : t("pricing.portal.btn")}
            </button>
          </div>
        ) : null}

        <section className="pb-4 border-t border-gray-800/80 pt-8">
          <FinancialDisclaimer />
        </section>
      </div>
    </>
  );
}
