import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import toast from "react-hot-toast";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { useClientAuthToken } from "../hooks/useClientAuthToken";

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
  const success = useMemo(() => router.query.success === "true", [router.query.success]);
  const canceled = useMemo(() => router.query.canceled === "true", [router.query.canceled]);

  const startCheckout = async (plan) => {
    if (!token) {
      toast.error("Connect wallet first to purchase.");
      return;
    }

    try {
      setLoadingPlan(plan);
      const res = await fetch(`${getPublicApiUrl()}/api/v1/create-checkout-session`, {
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
        <p className="sl-label mb-2">Subscriptions</p>
        <h1 className="sl-display bg-gradient-to-r from-purple-400 via-violet-300 to-cyan-300 bg-clip-text text-transparent">
          Pricing
        </h1>
        <p className="sl-body sl-muted mt-3 max-w-2xl">
          Monthly PRO access or a one-time Lifetime unlock. Powered by Stripe.
        </p>
        {success ? (
          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            Payment received. Your plan updates shortly after Stripe confirms the webhook.
          </div>
        ) : null}
        {canceled ? (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Checkout canceled. You can try again anytime.
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
    </div>
  );
}
