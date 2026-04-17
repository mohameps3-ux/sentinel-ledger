const express = require("express");
const Stripe = require("stripe");
const { authMiddleware } = require("./auth");
const {
  applyCheckoutSessionCompleted,
  applyInvoicePaid,
  applySubscriptionDeleted,
  getLatestSubscription
} = require("../services/subscriptionService");

const billingRouter = express.Router();

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
}

function resolvePriceId(plan) {
  if (plan === "pro") return process.env.STRIPE_PRO_PRICE_ID;
  if (plan === "super_pro") return process.env.STRIPE_SUPER_PRO_PRICE_ID;
  if (plan === "lifetime") return process.env.STRIPE_LIFETIME_PRICE_ID;
  return null;
}

function appBaseUrl(req) {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL || process.env.SENTINEL_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return `${proto}://${host}`;
}

billingRouter.post("/create-checkout-session", authMiddleware, async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ ok: false, error: "stripe_not_configured" });

    const plan = String(req.body?.plan || "");
    const priceId = resolvePriceId(plan);
    if (!priceId) return res.status(400).json({ ok: false, error: "invalid_plan" });

    const base = appBaseUrl(req);
    const isLifetime = plan === "lifetime";

    const session = await stripe.checkout.sessions.create({
      mode: isLifetime ? "payment" : "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/pricing?success=true`,
      cancel_url: `${base}/pricing?canceled=true`,
      metadata: {
        userId: String(req.user.userId),
        plan
      }
    });

    return res.json({ ok: true, url: session.url });
  } catch (error) {
    console.error("create-checkout-session:", error);
    return res.status(500).json({ ok: false, error: "checkout_session_failed" });
  }
});

billingRouter.post("/create-portal-session", authMiddleware, async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ ok: false, error: "stripe_not_configured" });

    const row = await getLatestSubscription(req.user.userId);
    const customerId = row?.stripe_customer_id;
    if (!customerId) return res.status(400).json({ ok: false, error: "no_stripe_customer" });

    const base = appBaseUrl(req);
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${base}/pricing`
    });

    return res.json({ ok: true, url: portal.url });
  } catch (error) {
    console.error("create-portal-session:", error);
    return res.status(500).json({ ok: false, error: "portal_session_failed" });
  }
});

async function stripeWebhookHandler(req, res) {
  try {
    const stripe = getStripe();
    if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
      return res.status(503).json({ ok: false, error: "stripe_webhook_not_configured" });
    }

    const sig = req.headers["stripe-signature"];
    if (!sig) return res.status(400).json({ ok: false, error: "missing_signature" });

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error("stripe signature:", err.message);
      return res.status(400).json({ ok: false, error: "webhook_verification_failed" });
    }

    try {
      switch (event.type) {
        case "checkout.session.completed":
          await applyCheckoutSessionCompleted(event.data.object);
          break;
        case "invoice.paid":
          await applyInvoicePaid(event.data.object);
          break;
        case "customer.subscription.deleted":
          await applySubscriptionDeleted(event.data.object);
          break;
        default:
          break;
      }
    } catch (processingError) {
      console.error("stripe webhook processing:", processingError);
      return res.status(500).json({ ok: false, error: "webhook_processing_failed" });
    }

    return res.json({ received: true });
  } catch (error) {
    console.error("stripe-webhook:", error);
    return res.status(500).json({ ok: false, error: "webhook_failed" });
  }
}

module.exports = { billingRouter, stripeWebhookHandler };
