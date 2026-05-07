import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import toast from "react-hot-toast";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { useClientAuthToken } from "../hooks/useClientAuthToken";
import { FinancialDisclaimer } from "../components/layout/FinancialDisclaimer";
import { useLocale } from "../contexts/LocaleContext";
import {
  InstitutionalPage,
  InstitutionalSection,
  InstitutionalCard,
  InstitutionalCallout
} from "../components/institutional";
import CryptoPayButton from "../components/pricing/CryptoPayButton";

function Cell({ v, ariaIncluded, ariaNotIncluded }) {
  if (v === true) return <span className="text-sl-green font-bold" aria-label={ariaIncluded}>✓</span>;
  if (v === false) return <span className="text-sl-red" aria-label={ariaNotIncluded}>✗</span>;
  return <span className="text-xs text-sl-sub font-mono">{v}</span>;
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
        points: [t("pricing.plan.pro.p1"), t("pricing.plan.pro.p2"), t("pricing.plan.pro.p3")],
        checkoutEnabled: true
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
        highlight: true,
        checkoutEnabled: true
      },
      {
        id: "whale",
        title: t("pricing.plan.whale.title"),
        priceLine: t("pricing.plan.whale.price"),
        blurb: t("pricing.plan.whale.blurb"),
        points: [
          t("pricing.plan.whale.p1"),
          t("pricing.plan.whale.p2"),
          t("pricing.plan.whale.p3")
        ],
        checkoutEnabled: false
      }
    ],
    [t]
  );

  const featureRows = useMemo(
    () => [
      { feature: t("pricing.feat.tg"), pro: true, superPro: true, whale: true },
      { feature: t("pricing.feat.sm"), pro: true, superPro: true, whale: true },
      {
        feature: t("pricing.feat.depth"),
        pro: t("pricing.val.24h"),
        superPro: t("pricing.val.extended"),
        whale: t("pricing.val.full")
      },
      {
        feature: t("pricing.feat.api"),
        pro: t("pricing.val.standard"),
        superPro: t("pricing.val.priority"),
        whale: t("pricing.val.highest")
      },
      {
        feature: t("pricing.feat.quotas"),
        pro: t("pricing.val.standard"),
        superPro: t("pricing.val.higher"),
        whale: t("pricing.val.highest")
      },
      {
        feature: t("pricing.feat.billing"),
        pro: t("pricing.val.monthly"),
        superPro: t("pricing.val.monthly"),
        whale: t("pricing.val.monthly")
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
    <InstitutionalPage
      trackerLabel="PRICING · ACCESS TIERS"
      title="Choose Your Intelligence Level"
      subtitle="Professional Solana trading intelligence. Cancel anytime."
      pageHeadTitle={t("pricing.pageTitle")}
      pageHeadDescription={t("pricing.pageDesc")}
      width="wide"
    >
      {mounted && !canCheckout ? (
        <InstitutionalCallout tone="warn" title={t("pricing.walletBannerTitle")}>
          {t("pricing.walletBannerBody")}
        </InstitutionalCallout>
      ) : null}

      <InstitutionalSection
        trackerLabel="01 · Plans"
        title="Subscription tiers"
        description="All plans include real-time signals, smart-wallet tracking, and priority support."
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((plan, idx) => {
            const isPrimary = Boolean(plan.highlight);
            const ctaClass = idx === 0 ? "btn-ghost mt-auto w-full" : isPrimary ? "btn-primary mt-auto w-full" : "btn-outline mt-auto w-full";
            const disabled = !mounted || !canCheckout || !plan.checkoutEnabled || loadingPlan === plan.id;
            const buttonLabel = plan.checkoutEnabled
              ? loadingPlan === plan.id
                ? t("pricing.btn.redirecting")
                : t("pricing.btn.checkout")
              : t("pricing.btn.comingSoon");

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
                <ul className="text-sm text-sl-sub space-y-1.5 flex-1">
                  {plan.points.map((point) => (
                    <li key={point} className="flex gap-2">
                      <span className="text-sl-green font-bold shrink-0 mt-0.5">✓</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => plan.checkoutEnabled && startCheckout(plan.id)}
                  disabled={disabled}
                  title={
                    !plan.checkoutEnabled
                      ? t("pricing.btn.comingSoonTitle")
                      : !canCheckout
                        ? t("pricing.btn.checkoutTitle")
                        : undefined
                  }
                  className={`${ctaClass} justify-center disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {buttonLabel}
                </button>
                {plan.id === "pro" && <CryptoPayButton />}
              </div>
            );
          })}
        </div>
      </InstitutionalSection>

      <InstitutionalSection
        trackerLabel="02 · Comparison"
        title="Feature matrix"
        description="Capabilities by plan. Hover the headers to inspect aria labels."
      >
        <InstitutionalCard padded={false}>
          <div className="overflow-x-auto">
            <table className="data-table min-w-[640px]">
              <thead>
                <tr>
                  <th className="data-th">{t("pricing.matrix.th.cap")}</th>
                  <th className="data-th text-center">{t("pricing.matrix.th.pro")}</th>
                  <th className="data-th text-center">{t("pricing.matrix.th.super")}</th>
                  <th className="data-th text-center">{t("pricing.matrix.th.whale")}</th>
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
                      <Cell v={row.whale} ariaIncluded={t("pricing.aria.included")} ariaNotIncluded={t("pricing.aria.notIncluded")} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </InstitutionalCard>
        <p className="text-xs text-sl-muted mt-3">{t("pricing.footnote")}</p>
      </InstitutionalSection>

      {mounted && canCheckout ? (
        <InstitutionalSection
          trackerLabel="03 · Manage subscription"
          title={t("pricing.portal.title")}
          description={t("pricing.portal.sub")}
          actions={
            <button
              type="button"
              onClick={openBillingPortal}
              disabled={portalLoading}
              className="btn-ghost-sm shrink-0 disabled:opacity-50"
            >
              {portalLoading ? t("pricing.portal.opening") : t("pricing.portal.btn")}
            </button>
          }
        >
          <InstitutionalCard tone="accent">
            <p className="text-sm text-sl-sub">
              Open the Stripe billing portal to update payment methods, download invoices, or cancel your plan.
            </p>
          </InstitutionalCard>
        </InstitutionalSection>
      ) : null}

      <FinancialDisclaimer />
    </InstitutionalPage>
  );
}
