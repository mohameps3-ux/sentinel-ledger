import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import toast from "react-hot-toast";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { useClientAuthToken } from "../hooks/useClientAuthToken";

const PLANS = [
  {
    id: "pro",
    title: "PRO",
    price: "$19 / month",
    points: ["Advanced alerts", "Priority flow intel", "Faster refresh windows"]
  },
  {
    id: "super_pro",
    title: "SUPER PRO",
    price: "$49 / month",
    points: ["Everything in PRO", "Expanded signal depth", "Higher alert quotas"]
  },
  {
    id: "lifetime",
    title: "LIFETIME",
    price: "$499 one-time",
    points: ["Permanent unlock", "All future PRO features", "No monthly renewals"]
  }
];

export default function PricingPage() {
  const token = useClientAuthToken();
  const router = useRouter();
  const [loadingPlan, setLoadingPlan] = useState("");
  const checkoutResult = useMemo(() => String(router.query.checkout || ""), [router.query.checkout]);

  const startCheckout = async (plan) => {
    if (!token) {
      toast.error("Connect wallet first to purchase.");
      return;
    }

    try {
      setLoadingPlan(plan);
      const res = await fetch(`${getPublicApiUrl()}/api/v1/billing/create-checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ plan })
      });
      const json = await res.json();
      if (!res.ok || !json?.ok || !json?.url) {
        throw new Error(json?.error || "checkout_failed");
      }
      window.location.href = json.url;
    } catch (error) {
      toast.error(`Checkout failed: ${error.message}`);
    } finally {
      setLoadingPlan("");
    }
  };

  return (
    <div className="sl-container py-8 sm:py-10 md:py-14 max-w-full">
      <section className="glass-card sl-inset">
        <p className="sl-label mb-2">Monetization</p>
        <h1 className="sl-display bg-gradient-to-r from-purple-400 via-violet-300 to-cyan-300 bg-clip-text text-transparent">
          Pricing & Support
        </h1>
        <p className="sl-body sl-muted mt-3 max-w-2xl">
          Keep Sentinel Ledger sustainable: unlock PRO features with Stripe or support directly with Solana donations.
        </p>
        {checkoutResult === "success" ? (
          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            Payment confirmed. Your plan updates after webhook processing.
          </div>
        ) : null}
        {checkoutResult === "cancel" ? (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Checkout canceled. You can retry anytime.
          </div>
        ) : null}
      </section>

      <section className="sl-section mt-6">
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
                disabled={loadingPlan === plan.id}
                className="btn-pro mt-auto justify-center"
              >
                {loadingPlan === plan.id ? "Redirecting..." : "Buy now"}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="glass-card sl-inset mt-6">
        <p className="sl-label mb-2">Crypto Donations</p>
        <h2 className="sl-h2 text-white">Support via Solana</h2>
        <p className="text-sm text-gray-300 mt-2">
          Send SOL to the donation wallet configured in backend (`DONATION_WALLET_SOLANA`). Rewards are auto-processed.
        </p>
        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 mono text-xs text-gray-300 break-all">
          {process.env.NEXT_PUBLIC_DONATION_WALLET || "Set NEXT_PUBLIC_DONATION_WALLET in frontend env"}
        </div>
      </section>
    </div>
  );
}
