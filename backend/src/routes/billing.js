const express = require("express");
const Stripe = require("stripe");
const { authMiddleware } = require("./auth");
const { durationForPlan, grantPlanDuration } = require("../services/subscriptionService");

const billingRouter = express.Router();

function getStripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
}

function resolvePriceId(plan) {
  if (plan === "pro") return process.env.STRIPE_PRO_PRICE_ID;
  if (plan === "super_pro") return process.env.STRIPE_SUPER_PRO_PRICE_ID;
  if (plan === "lifetime") return process.env.STRIPE_LIFETIME_PRICE_ID;
  return null;
}

function checkoutBaseUrl(req) {
  const configured = process.env.SENTINEL_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return `${proto}://${host}`;
}

billingRouter.post("/create-checkout-session", authMiddleware, async (req, res) => {
  try {
    const stripe = getStripeClient();
    if (!stripe) return res.status(503).json({ ok: false, error: "stripe_not_configured" });

    const plan = String(req.body?.plan || "");
    const priceId = resolvePriceId(plan);
    if (!priceId) return res.status(400).json({ ok: false, error: "invalid_plan" });

    const base = checkoutBaseUrl(req);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/pricing?checkout=success`,
      cancel_url: `${base}/pricing?checkout=cancel`,
      metadata: {
        userId: req.user.userId,
        plan
      }
    });

    return res.json({ ok: true, url: session.url, id: session.id });
  } catch (error) {
    console.error("create-checkout-session:", error);
    return res.status(500).json({ ok: false, error: "checkout_session_failed" });
  }
});

async function stripeWebhookHandler(req, res) {
  try {
    const stripe = getStripeClient();
    if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
      return res.status(503).json({ ok: false, error: "stripe_webhook_not_configured" });
    }

    const sig = req.headers["stripe-signature"];
    if (!sig) return res.status(400).json({ ok: false, error: "missing_signature" });
    const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = session?.metadata?.userId;
      const plan = session?.metadata?.plan;
      if (userId && plan) {
        await grantPlanDuration({
          userId,
          plan,
          durationMs: durationForPlan(plan),
          stripeCustomerId: session.customer ? String(session.customer) : null,
          stripeSubscriptionId: session.subscription ? String(session.subscription) : null
        });
      }
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error("stripe-webhook:", error.message || error);
    return res.status(400).json({ ok: false, error: "webhook_verification_failed" });
  }
}

module.exports = { billingRouter, stripeWebhookHandler };
