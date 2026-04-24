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
  "stalker.toast.removed": S("Wallet removed.", { es: "Wallet eliminada." })
};
