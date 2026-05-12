import { S } from "./stringRow";

/** @type {Record<string, Record<string, string>>} */
export const PRICING_PAGE_STRINGS = {
  "pricing.pageTitle": S("Pricing — Sentinel Ledger", {
    es: "Precios — Sentinel Ledger",
    fr: "Tarifs — Sentinel Ledger",
    de: "Preise — Sentinel Ledger"
  }),
  "pricing.pageDesc": S(
    "Sentinel monthly access tiers: PRO, Super Pro, and Whale / Elite. Stripe Checkout + customer portal.",
    {
      es: "Planes mensuales de Sentinel: PRO, Super Pro y Whale / Elite. Stripe Checkout + portal de cliente."
    }
  ),
  "pricing.label": S("Billing", { es: "Facturación", fr: "Facturation", de: "Abrechnung" }),
  "pricing.h1": S("Terminal pricing", { es: "Precios del terminal", fr: "Tarifs du terminal" }),
  "pricing.hero": S(
    "Three recurring tiers: PRO for active traders, Super Pro for the core alpha workflow, and Whale / Elite for institutional-grade access. Payments route through Stripe Checkout.",
    {
      es: "Tres niveles recurrentes: PRO para traders activos, Super Pro para el flujo principal de alpha y Whale / Elite para acceso de grado institucional. Los pagos van por Stripe Checkout."
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
  "pricing.plan.pro.price": S("€29.99 / mo", { es: "29,99 € / mes" }),
  "pricing.plan.pro.blurb": S(
    "Live smart-money alerts, filtered signals, watchlist intelligence, and core Sentinel visibility.",
    {
      es: "Alertas smart-money en vivo, señales filtradas, inteligencia de watchlist y visibilidad core de Sentinel."
    }
  ),
  "pricing.plan.pro.p1": S("Telegram / push PRO alerts", { es: "Alertas PRO por Telegram / push" }),
  "pricing.plan.pro.p2": S("Smart money highlights", { es: "Destacados de smart money" }),
  "pricing.plan.pro.p3": S("Standard signal and scanner access", { es: "Acceso estándar a señales y scanner" }),

  "pricing.plan.super.title": S("SUPER PRO"),
  "pricing.plan.super.price": S("€69.99 / mo", { es: "69,99 € / mes" }),
  "pricing.plan.super.blurb": S(
    "The main alpha workflow: cluster buys, velocity spikes, regime context, deeper track record, and priority refresh.",
    {
      es: "El flujo principal de alpha: cluster buys, velocity spikes, contexto de régimen, track record ampliado y refresco prioritario."
    }
  ),
  "pricing.plan.super.p1": S("Everything in PRO", { es: "Todo lo de PRO" }),
  "pricing.plan.super.p2": S("Expanded signal depth", { es: "Profundidad de señales ampliada" }),
  "pricing.plan.super.p3": S("Higher alert quotas", { es: "Cuotas de alertas mayores" }),
  "pricing.plan.super.p4": S("Priority refresh lanes", { es: "Carriles de refresco prioritarios" }),

  "pricing.plan.whale.title": S("WHALE / ELITE"),
  "pricing.plan.whale.price": S("€129 / mo", { es: "129 € / mes" }),
  "pricing.plan.whale.blurb": S(
    "Institutional-grade access for high-conviction users: full smart-wallet coverage, advanced ops insight, exports, and priority intelligence.",
    {
      es: "Acceso de grado institucional para usuarios de alta convicción: cobertura smart-wallet completa, ops avanzado, exportaciones e inteligencia prioritaria."
    }
  ),
  "pricing.plan.whale.p1": S("Full smart-wallet intelligence", { es: "Inteligencia smart-wallet completa" }),
  "pricing.plan.whale.p2": S("Advanced regime and ops insights", { es: "Insights avanzados de régimen y ops" }),
  "pricing.plan.whale.p3": S("Priority access to new alpha features", { es: "Acceso prioritario a nuevas funciones alpha" }),

  "pricing.matrix.label": S("Feature matrix", { es: "Matriz de funciones", fr: "Matrice des fonctionnalités" }),
  "pricing.matrix.th.cap": S("Capability", { es: "Capacidad", fr: "Capacité" }),
  "pricing.matrix.th.pro": S("PRO"),
  "pricing.matrix.th.super": S("SUPER PRO"),
  "pricing.matrix.th.whale": S("WHALE / ELITE"),

  "pricing.feat.tg": S("Telegram PRO alerts", { es: "Alertas PRO Telegram" }),
  "pricing.feat.sm": S("Smart money + deployer intel", { es: "Smart money + intel del deployer" }),
  "pricing.feat.depth": S("Signal history depth", { es: "Profundidad del historial de señales" }),
  "pricing.feat.api": S("API / refresh priority", { es: "Prioridad API / refresco" }),
  "pricing.feat.quotas": S("Alert quotas", { es: "Cuotas de alertas" }),
  "pricing.feat.billing": S("Billing", { es: "Facturación" }),

  "pricing.val.24h": S("24h focus", { es: "Enfoque 24 h" }),
  "pricing.val.extended": S("Extended", { es: "Ampliado" }),
  "pricing.val.full": S("Full", { es: "Completo" }),
  "pricing.val.standard": S("Standard", { es: "Estándar" }),
  "pricing.val.priority": S("Priority", { es: "Prioridad" }),
  "pricing.val.highest": S("Highest", { es: "Máxima" }),
  "pricing.val.higher": S("Higher", { es: "Mayor" }),
  "pricing.val.monthly": S("Monthly", { es: "Mensual" }),

  "pricing.aria.included": S("Included", { es: "Incluido" }),
  "pricing.aria.notIncluded": S("Not included", { es: "No incluido" }),

  "pricing.btn.redirecting": S("Redirecting to Stripe…", { es: "Redirigiendo a Stripe…" }),
  "pricing.btn.checkout": S("Stripe checkout", { es: "Checkout Stripe" }),
  "pricing.btn.comingSoon": S("Coming soon", { es: "Próximamente" }),
  "pricing.btn.checkoutTitle": S("Connect wallet in the header and sign the message first", {
    es: "Primero conecta la wallet en el encabezado y firma el mensaje"
  }),
  "pricing.btn.comingSoonTitle": S("This tier is not connected to checkout yet.", {
    es: "Este nivel todavía no está conectado al checkout."
  }),

  "pricing.footnote": S(
    "Stripe processes card subscriptions. Crypto checkout is not active in the UI yet; Sentinel will never ask you to send funds to an unverified address from this page.",
    {
      es: "Stripe procesa las suscripciones con tarjeta. El checkout crypto todavía no está activo en la interfaz; Sentinel nunca te pedirá enviar fondos a una dirección no verificada desde esta página."
    }
  ),

  "pricing.portal.title": S("Already paying?", { es: "¿Ya pagas?", fr: "Déjà abonné ?" }),
  "pricing.portal.sub": S("Open the Stripe customer portal for invoices, cancellation, or card updates.", {
    es: "Abre el portal de cliente de Stripe para facturas, cancelación o cambio de tarjeta."
  }),
  "pricing.portal.opening": S("Opening…", { es: "Abriendo…" }),
  "pricing.portal.btn": S("Billing portal", { es: "Portal de facturación" })
};
