import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import toast from "react-hot-toast";
import { Check, X } from "lucide-react";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { useClientAuthToken } from "../hooks/useClientAuthToken";
import { FinancialDisclaimer } from "../components/layout/FinancialDisclaimer";
import { PageHead } from "../components/seo/PageHead";

const PLANS = [
  {
    id: "pro",
    title: "PRO",
    priceLine: "$19 / mo",
    blurb: "Live alerts, faster refresh cadence, and deeper flow cards for active wallets.",
    points: ["Telegram PRO alerts", "Smart money highlights", "Standard API cadence"]
  },
  {
    id: "super_pro",
    title: "SUPER PRO",
    priceLine: "$49 / mo",
    blurb: "Desk-grade context: wider signal history, richer wallet graphs, and priority compute.",
    points: ["Everything in PRO", "Expanded signal depth", "Higher alert quotas", "Priority refresh lanes"],
    highlight: true
  },
  {
    id: "lifetime",
    title: "LIFETIME",
    priceLine: "$199 one-time",
    blurb: "Lock in PRO-tier access without renewals. Stripe one-shot checkout.",
    points: ["Permanent unlock (PRO tier)", "All future PRO-tier features", "No monthly renewals"]
  }
];

const FEATURE_ROWS = [
  { feature: "Telegram PRO alerts", pro: true, superPro: true, lifetime: true },
  { feature: "Smart money + deployer intel", pro: true, superPro: true, lifetime: true },
  { feature: "Signal history depth", pro: "24h focus", superPro: "Extended", lifetime: "Extended" },
  { feature: "API / refresh priority", pro: "Standard", superPro: "Priority", lifetime: "Priority" },
  { feature: "Alert quotas", pro: "Standard", superPro: "Higher", lifetime: "Higher" },
  { feature: "Billing", pro: "Monthly", superPro: "Monthly", lifetime: "One-time" }
];

function Cell({ v }) {
  if (v === true) return <Check className="text-emerald-400 mx-auto" size={18} aria-label="Included" />;
  if (v === false) return <X className="text-red-400/80 mx-auto" size={18} aria-label="Not included" />;
  return <span className="text-xs text-gray-300 font-mono">{v}</span>;
}

export default function PricingPage() {
  const token = useClientAuthToken();
  const router = useRouter();
  const [loadingPlan, setLoadingPlan] = useState("");
  const [mounted, setMounted] = useState(false);
  const success = useMemo(() => router.query.success === "true", [router.query.success]);
  const canceled = useMemo(() => router.query.canceled === "true", [router.query.canceled]);

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
      toast.success("Payment received. Your plan updates shortly after Stripe confirms the webhook.");
    }
    if (canceled) {
      toast("Checkout canceled. You can try again anytime.", { icon: "ℹ️" });
    }
  }, [router.isReady, success, canceled]);

  const [portalLoading, setPortalLoading] = useState(false);

  const openBillingPortal = async () => {
    if (!effectiveToken) {
      toast.error("Connect your wallet in the header and sign the message, then try again.");
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
      toast.error(e.message || "Could not open billing portal.");
    } finally {
      setPortalLoading(false);
    }
  };

  const startCheckout = async (plan) => {
    if (!effectiveToken) {
      toast.error("Connect your wallet in the header and sign the message, then try again.");
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
          json?.error === "invalid_price_configuration"
            ? "Pricing config is invalid. Please contact support."
            : json?.error || "checkout_failed";
        throw new Error(message);
      }
      window.location.href = json.url;
    } catch (error) {
      const message = error?.name === "AbortError" ? "Checkout request timed out. Try again." : error.message;
      toast.error(`Checkout failed: ${message}`);
    } finally {
      clearTimeout(timeout);
      setLoadingPlan("");
    }
  };

  return (
    <>
      <PageHead
        title="Pricing — Sentinel Ledger"
        description="PRO $19/mo, Super Pro $49/mo, or Lifetime unlock. Stripe Checkout + customer portal."
      />
      <div className="sl-container py-8 sm:py-10 md:py-14 max-w-full space-y-8">
        <section className="sl-home-hero sl-inset sm:p-7 ring-1 ring-white/[0.06]">
          <p className="sl-label text-emerald-400/90">Billing</p>
          <h1 className="sl-h1 text-white mt-2 tracking-tight">Terminal pricing</h1>
          <p className="sl-body sl-muted mt-2 max-w-2xl">
            Three lanes: lean PRO, heavy Super Pro, or a one-time Lifetime key. Payments route through Stripe Checkout
            — configure live <span className="mono text-gray-500">STRIPE_*_PRICE_ID</span> in production.
          </p>
        </section>

        {mounted && !canCheckout ? (
          <div
            className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
            role="status"
          >
            <strong className="text-amber-50">Wallet required.</strong> Use Connect wallet in the header, approve the
            Solana signature, then return here — checkout binds to your signed-in Sentinel account.
          </div>
        ) : null}

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`glass-card sl-inset flex flex-col gap-4 relative overflow-hidden ${
                plan.highlight ? "ring-1 ring-cyan-500/30" : ""
              }`}
            >
              {plan.highlight ? (
                <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-violet-500 via-cyan-400 to-emerald-400" />
              ) : null}
              <div>
                <h2 className="text-lg font-semibold text-white tracking-tight">{plan.title}</h2>
                <p className="text-2xl font-bold text-white mt-2 mono">{plan.priceLine}</p>
                <p className="text-sm text-gray-400 mt-2 leading-relaxed">{plan.blurb}</p>
              </div>
              <ul className="text-sm text-gray-300 space-y-1.5 flex-1">
                {plan.points.map((point) => (
                  <li key={point} className="flex gap-2">
                    <Check size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => startCheckout(plan.id)}
                disabled={!mounted || loadingPlan === plan.id || !canCheckout}
                title={
                  !canCheckout
                    ? "Connect wallet in the header and sign the message first"
                    : undefined
                }
                className="btn-pro mt-auto justify-center disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loadingPlan === plan.id ? "Redirecting to Stripe…" : "Stripe checkout"}
              </button>
            </div>
          ))}
        </section>

        <section className="glass-card sl-inset overflow-x-auto">
          <p className="sl-label mb-4">Feature matrix</p>
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-white/10">
                <th className="py-2 pr-3">Capability</th>
                <th className="py-2 pr-3 text-center">PRO</th>
                <th className="py-2 pr-3 text-center">SUPER PRO</th>
                <th className="py-2 text-center">LIFETIME</th>
              </tr>
            </thead>
            <tbody>
              {FEATURE_ROWS.map((row) => (
                <tr key={row.feature} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="py-3 pr-3 text-gray-200">{row.feature}</td>
                  <td className="py-3 pr-3 text-center">
                    <Cell v={row.pro} />
                  </td>
                  <td className="py-3 pr-3 text-center">
                    <Cell v={row.superPro} />
                  </td>
                  <td className="py-3 text-center">
                    <Cell v={row.lifetime} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <p className="text-xs text-gray-500">
          Stripe processes cards; Sentinel never asks you to “send SOL” for these SKUs. Lifetime maps to the same
          PRO entitlements unless your deployment configures otherwise in webhooks.
        </p>

        {mounted && canCheckout ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-white">Already paying?</p>
              <p className="text-xs text-gray-400 mt-1">Open the Stripe customer portal for invoices, cancellation, or card updates.</p>
            </div>
            <button
              type="button"
              onClick={openBillingPortal}
              disabled={portalLoading}
              className="shrink-0 px-4 py-2 rounded-lg border border-white/15 bg-white/[0.05] text-sm text-gray-100 hover:bg-white/[0.09] disabled:opacity-50"
            >
              {portalLoading ? "Opening…" : "Billing portal"}
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
