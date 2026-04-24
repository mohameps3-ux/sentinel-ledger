import { S } from "./stringRow";

/** @type {Record<string, Record<string, string>>} */
export const HOME_PAGE_STRINGS = {
  "home.pageTitle": S("Sentinel Ledger — Smart Money Tracker for Solana in Real Time", {
    es: "Sentinel Ledger — Smart money en Solana en tiempo real"
  }),
  "home.pageDesc": S("Track the highest win-rate wallets on Solana. Interpreted signals, not raw noise. Free to start.", {
    es: "Sigue las wallets con mayor win rate en Solana. Señales interpretadas, no ruido bruto. Empieza gratis."
  }),
  "home.context.heat": S("Heat (market), after DB signals", {
    es: "Calor (mercado), tras señales de BD"
  }),
  "home.mood.empty": S("—", { es: "—" }),
  "home.mood.favorable": S("Favorable", { es: "Favorable" }),
  "home.mood.temperate": S("Tempered", { es: "Templado" }),
  "home.mood.defensive": S("Defensive", { es: "A la defensiva" }),
  "home.best.horizon": S("~1h est.", { es: "~1h est." }),
  "home.step1.line": S(
    "Step 1 — Watch LIVE, HOT, or HISTORY above. Search and wallet stay pinned. On wide screens use «More»; on mobile, the ☰ menu.",
    {
      es: "Paso 1 — Mira LIVE, HOT o HISTORY arriba. Buscador y wallet fijos. En pantalla ancha, «Más»; en móvil, el menú ☰."
    }
  )
};
