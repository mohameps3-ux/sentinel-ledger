import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import toast from "react-hot-toast";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { useClientAuthToken } from "../hooks/useClientAuthToken";
import { FinancialDisclaimer } from "../components/layout/FinancialDisclaimer";

const PLANS = [
  {
    id: "pro",
    title: "PRO",
    price: "$9.99 / month",
    points: ["Advanced alerts", "Priority flow intel", "Faster refresh windows"]
  },
  {
    id: "super_pro",
    title: "SUPER PRO",
    price: "$19.99 / month",
    points: ["Everything in PRO", "Expanded signal depth", "Higher alert quotas"]
  },
  {
    id: "lifetime",
    title: "LIFETIME",
    price: "$149.99 one-time",
    points: ["Permanent unlock", "All future PRO-tier features", "No monthly renewals"]
  }
];

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
    <div className="sl-container py-8 sm:py-10 md:py-14 max-w-full">
      <section className="glass-card sl-inset">
        <p className="sl-label mb-2">Subscriptions</p>
        <h1 className="sl-display bg-gradient-to-r from-purple-400 via-violet-300 to-cyan-300 bg-clip-text text-transparent">
          Pricing
        </h1>
        <p className="sl-body sl-muted mt-3 max-w-2xl">
          Monthly PRO access or a one-time Lifetime unlock. Powered by Stripe.
        </p>
      </section>

      <section className="sl-section mt-6">
        {mounted && !canCheckout ? (
          <div
            className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
            role="status"
          >
            <strong className="text-amber-50">Wallet required.</strong> Use{" "}
            <span className="text-white/90">Connect wallet</span> in the header, approve the Solana
            signature, then return here — Stripe checkout uses your signed-in account.
          </div>
        ) : null}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((plan) => (
            <div key={plan.id} className="glass-card p-5 rounded-2xl flex flex-col gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">{plan.title}</h2>
                <p className="text-sm text-cyan-200 mt-1">{plan.price}</p>
              </div>
              <ul className="text-sm text-gray-300 space-y-1">
                {plan.points.map((point) => (
                  <li key={point}>• {point}</li>
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
                {loadingPlan === plan.id ? "Redirecting to Stripe..." : "Go to Stripe Checkout"}
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-4">
          Payments are processed by Stripe Checkout (card/billing flow), not by wallet transfer.
        </p>
        {mounted && canCheckout ? (
          <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-white">Already paying?</p>
              <p className="text-xs text-gray-400 mt-1">
                Open the Stripe customer portal to update card, cancel, or see invoices.
              </p>
            </div>
            <button
              type="button"
              onClick={openBillingPortal}
              disabled={portalLoading}
              className="shrink-0 px-4 py-2 rounded-lg border border-purple-500/40 bg-purple-500/15 text-sm text-purple-200 hover:bg-purple-500/25 disabled:opacity-50"
            >
              {portalLoading ? "Opening…" : "Stripe billing portal"}
            </button>
          </div>
        ) : null}
      </section>

      <section className="mt-10 pb-4 border-t border-gray-800/80 pt-8">
        <FinancialDisclaimer />
      </section>
    </div>
  );
}
