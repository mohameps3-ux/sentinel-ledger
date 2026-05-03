/**
 * Copy + formatters for wallet_behavior_stats (behavior memory).
 * Keeps numbers honest: explains horizon mismatch and hides broken anchors.
 */

import { formatUsdAmount } from "./formatStable";

/** Minutes from pair creation to buy; above this the DEX "created" time is usually wrong (migrated / wrong pool). */
export const LATENCY_SANITY_MAX_MIN = 7 * 24 * 60;

export function formatLatencyPostDeployMin(min) {
  if (min == null || !Number.isFinite(Number(min))) return { text: "—", unreliable: false };
  const m = Number(min);
  if (m < 0) return { text: "—", unreliable: false };
  if (m > LATENCY_SANITY_MAX_MIN) return { text: "—", unreliable: true };
  if (m >= 1440) return { text: `${(m / 1440).toFixed(1)} d`, unreliable: false };
  if (m >= 60) return { text: `${(m / 60).toFixed(1)} h`, unreliable: false };
  return { text: `${m.toFixed(0)} min`, unreliable: false };
}

export function formatPrePumpUsd(usd) {
  const n = Number(usd);
  if (!Number.isFinite(n) || n <= 0) return { text: "—", empty: true };
  return { text: `$${formatUsdAmount(n)}`, empty: false };
}

export const BEHAVIOR_LEGEND_ES =
  "Win rate «real» = % de señales con resultado final (columna agregada) > 0. Las columnas 5m / 30m / 2h usan solo ese horizonte: puedes ver verde a 5m y rojo al cierre. " +
  "Pre-pump = ticket medio solo en compras ligadas a señales que terminaron ≥ +20%; si sale —, no hubo casos en la ventana. " +
  "Latencia = tiempo desde la marca «pair created» del DEX hasta tu compra; si el par es viejo o migrado, el dato suele ser basura (mostramos — si supera ~7 d).";

export const BEHAVIOR_LEGEND_EN =
  "«Real» win rate uses the final tagged outcome per signal (> 0). The 5m / 30m / 2h columns only use that horizon—you can be green at 5m and red at close. " +
  "Pre-pump size averages buys tied to signals that finished ≥ +20%; «—» means no qualifying cases in the window. " +
  "Latency is DEX «pair created» → your buy; migrated or mis-anchored pools break this (we show — above ~7d).";
