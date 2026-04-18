const express = require("express");
const rateLimit = require("express-rate-limit");
const Stripe = require("stripe");
const { authMiddleware } = require("./auth");
const {
  applyCheckoutSessionCompleted,
  applyInvoicePaid,
  applySubscriptionDeleted,
  getLatestSubscription
} = require("../services/subscriptionService");
const {
  tryClaimStripeEvent,
  releaseStripeEventClaim,
  markStripeEventProcessed,
  appendSystemLog
} = require("../services/stripeAuditLog");

const billingRouter = express.Router();

const checkoutLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user?.userId || req.ip || "anon")
});

const portalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user?.userId || req.ip || "anon")
});

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

function classifyCheckoutError(error) {
  const message = String(error?.raw?.message || error?.message || "");
  const code = String(error?.code || error?.raw?.code || "");
  if (message.includes("No such price") || code === "resource_missing") {
    return { status: 400, error: "invalid_price_configuration" };
  }
  if (code === "parameter_invalid_empty" || code === "parameter_missing") {
    return { status: 400, error: "invalid_checkout_parameters" };
  }
  return { status: 500, error: "checkout_session_failed" };
}

function getStripeWebhookSecrets() {
  const raw = [
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.STRIPE_WEBHOOK_SECRET_ALT,
    process.env.STRIPE_WEBHOOK_SECRETS
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  return Array.from(new Set(raw));
}

function constructEventWithAnySecret(stripe, payload, signature, webhookSecrets) {
  let lastError = null;
  for (const secret of webhookSecrets) {
    try {
      return stripe.webhooks.constructEvent(payload, signature, secret);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("No valid webhook secret configured");
}

billingRouter.post("/create-checkout-session", authMiddleware, checkoutLimiter, async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ ok: false, error: "stripe_not_configured" });

    const plan = String(req.body?.plan || "");
    const priceId = resolvePriceId(plan);
    if (!priceId) return res.status(400).json({ ok: false, error: "invalid_plan" });

    const base = appBaseUrl(req);
    const isLifetime = plan === "lifetime";

    const sessionParams = {
      mode: isLifetime ? "payment" : "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/pricing?success=true`,
      cancel_url: `${base}/pricing?canceled=true`,
      metadata: {
        userId: String(req.user.userId),
        plan
      },
      automatic_tax: { enabled: true },
      billing_address_collection: "required"
    };
    if (isLifetime) sessionParams.customer_creation = "always";

    const session = await stripe.checkout.sessions.create(sessionParams);

    return res.json({ ok: true, url: session.url });
  } catch (error) {
    console.error("create-checkout-session:", error);
    const mapped = classifyCheckoutError(error);
    return res.status(mapped.status).json({ ok: false, error: mapped.error });
  }
});

async function createPortalSessionHandler(req, res) {
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
    if (String(error?.raw?.message || "").includes("No such customer")) {
      return res.status(400).json({ ok: false, error: "invalid_stripe_customer" });
    }
    return res.status(500).json({ ok: false, error: "portal_session_failed" });
  }
}

billingRouter.post("/create-portal-session", authMiddleware, portalLimiter, createPortalSessionHandler);
billingRouter.post("/create-customer-portal", authMiddleware, portalLimiter, createPortalSessionHandler);

async function stripeWebhookHandler(req, res) {
  try {
    const stripe = getStripe();
    const webhookSecrets = getStripeWebhookSecrets();
    if (!stripe || !webhookSecrets.length) {
      return res.status(503).json({ ok: false, error: "stripe_webhook_not_configured" });
    }

    const sig = req.headers["stripe-signature"];
    if (!sig) return res.status(400).json({ ok: false, error: "missing_signature" });

    const payload = Buffer.isBuffer(req.body)
      ? req.body
      : typeof req.body === "string"
        ? Buffer.from(req.body, "utf8")
        : null;
    if (!payload) {
      console.error("stripe webhook: body must be raw Buffer (check middleware order / Content-Type)");
      return res.status(400).json({ ok: false, error: "invalid_body_encoding" });
    }

    let event;
    try {
      event = constructEventWithAnySecret(stripe, payload, sig, webhookSecrets);
    } catch (err) {
      const sk = process.env.STRIPE_SECRET_KEY || "";
      const modeHint = sk.includes("_test_") ? "test" : sk.includes("_live_") ? "live" : "unknown";
      console.error("stripe signature:", err.message, { modeHint, secretCount: webhookSecrets.length });
      return res.status(400).json({
        ok: false,
        error: "webhook_verification_failed",
        attempted_secrets: webhookSecrets.length,
        hint: "Use the Signing secret (whsec_...) from the same Stripe mode (test/live) as STRIPE_SECRET_KEY"
      });
    }

    const claimed = await tryClaimStripeEvent(event.id, event.type).catch((e) => {
      console.error("stripe_events claim:", e);
      throw e;
    });
    if (!claimed) {
      return res.json({ received: true, duplicate: true });
    }

    try {
      await appendSystemLog({
        category: "stripe_webhook",
        message: `processing ${event.type}`,
        metadata: { eventId: event.id, type: event.type }
      });

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

      await markStripeEventProcessed(event.id);
      await appendSystemLog({
        category: "stripe_webhook",
        message: `processed ${event.type}`,
        metadata: { eventId: event.id, type: event.type, ok: true }
      });
    } catch (processingError) {
      await releaseStripeEventClaim(event.id).catch(() => {});
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
