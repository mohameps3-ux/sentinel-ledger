import { S } from "./stringRow";

/** @type {Record<string, Record<string, string>>} */
export const PRICING_PAGE_STRINGS = {
  "pricing.pageTitle": S("Pricing — Sentinel Ledger", {
    es: "Precios — Sentinel Ledger",
    fr: "Tarifs — Sentinel Ledger",
    de: "Preise — Sentinel Ledger"
  }),
  "pricing.pageDesc": S(
    "PRO $19/mo, Super Pro $49/mo, or Lifetime unlock. Stripe Checkout + customer portal.",
    {
      es: "PRO 19 $/mes, Super Pro 49 $/mes o Lifetime. Stripe Checkout + portal de cliente."
    }
  ),
  "pricing.label": S("Billing", { es: "Facturación", fr: "Facturation", de: "Abrechnung" }),
  "pricing.h1": S("Terminal pricing", { es: "Precios del terminal", fr: "Tarifs du terminal" }),
  "pricing.hero": S(
    "Three lanes: lean PRO, heavy Super Pro, or a one-time Lifetime key. Payments route through Stripe Checkout — configure live STRIPE_*_PRICE_ID in production.",
    {
      es: "Tres niveles: PRO ligero, Super Pro intenso o Lifetime de un solo pago. Los pagos van por Stripe Checkout — configura STRIPE_*_PRICE_ID en producción."
    }
  ),
  "pricing.walletBannerTitle": S("Wallet required.", { es: "Se requiere wallet.", fr: "Portefeuille requis." }),
  "pricing.walletBannerBody": S(
    "Use Connect wallet in the header, approve the Solana signature, then return here — checkout binds to your signed-in Sentinel account.",
    {
      es: "Usa Conectar wallet en el encabezado, aprueba la firma de Solana y vuelve aquí: el checkout queda ligado a tu cuenta Sentinel firmada."
    }
  ),
  "pricing.toast.paymentOk": S(
    "Payment received. Your plan updates shortly after Stripe confirms the webhook.",
    {
      es: "Pago recibido. Tu plan se actualizará cuando Stripe confirme el webhook."
    }
  ),
  "pricing.toast.canceled": S("Checkout canceled. You can try again anytime.", {
    es: "Checkout cancelado. Puedes intentarlo cuando quieras."
  }),
  "pricing.toast.connectWallet": S("Connect your wallet in the header and sign the message, then try again.", {
    es: "Conecta tu wallet en el encabezado y firma el mensaje, luego inténtalo de nuevo."
  }),
  "pricing.toast.portalFail": S("Could not open billing portal.", {
    es: "No se pudo abrir el portal de facturación."
  }),
  "pricing.toast.invalidPrice": S("Pricing config is invalid. Please contact support.", {
    es: "La configuración de precios no es válida. Contacta con soporte."
  }),
  "pricing.toast.checkoutTimeout": S("Checkout request timed out. Try again.", {
    es: "La solicitud de checkout expiró. Inténtalo de nuevo."
  }),
  "pricing.toast.checkoutFail": S("Checkout failed: {{msg}}", {
    es: "Fallo en checkout: {{msg}}"
  }),

  "pricing.plan.pro.title": S("PRO"),
  "pricing.plan.pro.price": S("$19 / mo", { es: "19 $ / mes" }),
  "pricing.plan.pro.blurb": S(
    "Live alerts, faster refresh cadence, and deeper flow cards for active wallets.",
    {
      es: "Alertas en vivo, refresco más rápido y tarjetas de flujo más profundas para wallets activas."
    }
  ),
  "pricing.plan.pro.p1": S("Telegram PRO alerts", { es: "Alertas PRO por Telegram" }),
  "pricing.plan.pro.p2": S("Smart money highlights", { es: "Destacados de smart money" }),
  "pricing.plan.pro.p3": S("Standard API cadence", { es: "Cadencia API estándar" }),

  "pricing.plan.super.title": S("SUPER PRO"),
  "pricing.plan.super.price": S("$49 / mo", { es: "49 $ / mes" }),
  "pricing.plan.super.blurb": S(
    "Desk-grade context: wider signal history, richer wallet graphs, and priority compute.",
    {
      es: "Contexto de escritorio: más historial de señales, gráficos de wallets más ricos y cómputo prioritario."
    }
  ),
  "pricing.plan.super.p1": S("Everything in PRO", { es: "Todo lo de PRO" }),
  "pricing.plan.super.p2": S("Expanded signal depth", { es: "Profundidad de señales ampliada" }),
  "pricing.plan.super.p3": S("Higher alert quotas", { es: "Cuotas de alertas mayores" }),
  "pricing.plan.super.p4": S("Priority refresh lanes", { es: "Carriles de refresco prioritarios" }),

  "pricing.plan.life.title": S("LIFETIME"),
  "pricing.plan.life.price": S("$199 one-time", { es: "199 $ pago único" }),
  "pricing.plan.life.blurb": S("Lock in PRO-tier access without renewals. Stripe one-shot checkout.", {
    es: "Acceso nivel PRO sin renovaciones. Checkout único en Stripe."
  }),
  "pricing.plan.life.p1": S("Permanent unlock (PRO tier)", { es: "Desbloqueo permanente (nivel PRO)" }),
  "pricing.plan.life.p2": S("All future PRO-tier features", { es: "Todas las funciones PRO futuras" }),
  "pricing.plan.life.p3": S("No monthly renewals", { es: "Sin renovaciones mensuales" }),

  "pricing.matrix.label": S("Feature matrix", { es: "Matriz de funciones", fr: "Matrice des fonctionnalités" }),
  "pricing.matrix.th.cap": S("Capability", { es: "Capacidad", fr: "Capacité" }),
  "pricing.matrix.th.pro": S("PRO"),
  "pricing.matrix.th.super": S("SUPER PRO"),
  "pricing.matrix.th.life": S("LIFETIME"),

  "pricing.feat.tg": S("Telegram PRO alerts", { es: "Alertas PRO Telegram" }),
  "pricing.feat.sm": S("Smart money + deployer intel", { es: "Smart money + intel del deployer" }),
  "pricing.feat.depth": S("Signal history depth", { es: "Profundidad del historial de señales" }),
  "pricing.feat.api": S("API / refresh priority", { es: "Prioridad API / refresco" }),
  "pricing.feat.quotas": S("Alert quotas", { es: "Cuotas de alertas" }),
  "pricing.feat.billing": S("Billing", { es: "Facturación" }),

  "pricing.val.24h": S("24h focus", { es: "Enfoque 24 h" }),
  "pricing.val.extended": S("Extended", { es: "Ampliado" }),
  "pricing.val.standard": S("Standard", { es: "Estándar" }),
  "pricing.val.priority": S("Priority", { es: "Prioridad" }),
  "pricing.val.higher": S("Higher", { es: "Mayor" }),
  "pricing.val.monthly": S("Monthly", { es: "Mensual" }),
  "pricing.val.oneTime": S("One-time", { es: "Único" }),

  "pricing.aria.included": S("Included", { es: "Incluido" }),
  "pricing.aria.notIncluded": S("Not included", { es: "No incluido" }),

  "pricing.btn.redirecting": S("Redirecting to Stripe…", { es: "Redirigiendo a Stripe…" }),
  "pricing.btn.checkout": S("Stripe checkout", { es: "Checkout Stripe" }),
  "pricing.btn.checkoutTitle": S("Connect wallet in the header and sign the message first", {
    es: "Primero conecta la wallet en el encabezado y firma el mensaje"
  }),

  "pricing.footnote": S(
    "Stripe processes cards; Sentinel never asks you to “send SOL” for these SKUs. Lifetime maps to the same PRO entitlements unless your deployment configures otherwise in webhooks.",
    {
      es: "Stripe procesa tarjetas; Sentinel nunca te pide «enviar SOL» por estos SKU. Lifetime equivale a los mismos derechos PRO salvo que tu despliegue lo cambie en webhooks."
    }
  ),

  "pricing.portal.title": S("Already paying?", { es: "¿Ya pagas?", fr: "Déjà abonné ?" }),
  "pricing.portal.sub": S("Open the Stripe customer portal for invoices, cancellation, or card updates.", {
    es: "Abre el portal de cliente de Stripe para facturas, cancelación o cambio de tarjeta."
  }),
  "pricing.portal.opening": S("Opening…", { es: "Abriendo…" }),
  "pricing.portal.btn": S("Billing portal", { es: "Portal de facturación" })
};
