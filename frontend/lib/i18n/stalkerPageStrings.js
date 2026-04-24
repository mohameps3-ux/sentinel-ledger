import { S } from "./stringRow";

/** @type {Record<string, Record<string, string>>} */
export const STALKER_PAGE_STRINGS = {
  "stalker.pageTitle": S("Wallet Stalker — Sentinel Ledger", {
    es: "Wallet Stalker — Sentinel Ledger",
    fr: "Wallet Stalker — Sentinel Ledger"
  }),
  "stalker.pageDesc": S(
    "Track up to 3 wallets for free or unlimited on PRO with in-app notifications.",
    {
      es: "Hasta 3 wallets gratis o ilimitadas en PRO con notificaciones en la app."
    }
  ),
  "stalker.label": S("Wallet Stalker", { es: "Wallet Stalker" }),
  "stalker.h1": S("Real-time tracked wallets", { es: "Wallets seguidas en tiempo real" }),
  "stalker.sub": S("Free: 3 wallets. PRO: unlimited. Notifications are in-app only.", {
    es: "Gratis: 3 wallets. PRO: ilimitadas. Notificaciones solo en la app."
  }),
  "stalker.placeholder": S("Paste wallet address", { es: "Pega la dirección de la wallet" }),
  "stalker.track": S("Track", { es: "Seguir", fr: "Suivre" }),
  "stalker.listLabel": S("Tracked wallets", { es: "Wallets seguidas" }),
  "stalker.remove": S("Remove", { es: "Quitar", fr: "Retirer" }),
  "stalker.empty": S("No wallets tracked yet.", { es: "Aún no hay wallets seguidas." }),
  "stalker.toast.added": S("Wallet added to stalker.", { es: "Wallet añadida al stalker." }),
  "stalker.toast.addErr": S("Could not add wallet.", { es: "No se pudo añadir la wallet." }),
  "stalker.toast.removed": S("Wallet removed.", { es: "Wallet eliminada." }),
  "stalker.toast.cleared": S("Activity buffer cleared.", { es: "Buffer de actividad vaciado." }),
  "stalker.f3Title": S("Pack radar (F3)", { es: "Radar de packs (F3)", pt: "Radar de packs (F3)" }),
  "stalker.f3Sub": S(
    "Wolf Pack groups buy/swap on the same mint when 2+ watched wallets fire within ~10 minutes. Client-only buffer (last 40 events in this browser).",
    {
      es: "Wolf Pack agrupa compras/swaps en el mismo mint cuando 2+ wallets seguidas disparan en ~10 min. Buffer solo en este navegador (últimos 40 eventos).",
      pt: "Wolf Pack agrupa compra/swap no mesmo mint quando 2+ wallets seguidas disparam em ~10 min. Buffer só neste browser (últimos 40 eventos)."
    }
  ),
  "stalker.activityLabel": S("Recent activity", { es: "Actividad reciente", pt: "Atividade recente" }),
  "stalker.activityEmpty": S(
    "No buffered events yet. Stay logged in with the app open to catch live moves from watched wallets.",
    {
      es: "Sin eventos en buffer aún. Mantén sesión y la app abierta para captar movimientos en vivo.",
      pt: "Sem eventos no buffer ainda. Mantém a sessão e a app abertas para ver movimentos ao vivo."
    }
  ),
  "stalker.clearActivity": S("Clear buffer", { es: "Vaciar buffer", pt: "Limpar buffer" }),
  "stalker.wolfPackTitle": S("Wolf pack · {{n}} wallets", { es: "Wolf pack · {{n}} wallets", pt: "Wolf pack · {{n}} wallets" }),
  "stalker.wolfPackHint": S("Coordinated window on this mint — review before sizing.", {
    es: "Ventana coordinada en este mint — revisa antes de posicionar.",
    pt: "Janela coordenada neste mint — revisa antes de posicionar."
  }),
  "stalker.atomicLine": S("{{type}} · {{wallet}}", { es: "{{type}} · {{wallet}}", pt: "{{type}} · {{wallet}}" }),
  "stalker.f4Badge": S("Double down ×{{mult}}", {
    es: "Recarga ×{{mult}}",
    pt: "Reforço ×{{mult}}"
  }),
  "stalker.f4Help": S(
    "F4 (+F4.1): server compares this leg’s USD (buy or DEX swap receiving the mint) to the first such leg on the same wallet+mint (≥3×). Needs migration 017 + market USD.",
    {
      es: "F4 (+F4.1): el servidor compara el USD de esta pierna (compra o swap DEX recibiendo el mint) con la primera igual wallet+mint (≥3×). Requiere migración 017 + USD de mercado.",
      pt: "F4 (+F4.1): o servidor compara o USD desta perna (compra ou swap DEX recebendo o mint) à primeira mesma wallet+mint (≥3×). Precisa migração 017 + USD de mercado."
    }
  ),
  "stalker.poolImpactLine": S("Pool impact · {{level}} · {{pct}}%", {
    es: "Impacto pool · {{level}} · {{pct}}%",
    pt: "Impacto pool · {{level}} · {{pct}}%"
  })
};
