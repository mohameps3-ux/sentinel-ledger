/**
 * Pure Sentinel scoring, feed shaping, and tactical decision classes for the war home.
 * Reusable from `/`, `/scanner`, token pages — no React imports.
 */

import { isProbableSolanaMint } from "../../lib/solanaMint";
import { formatCountdown } from "./formatters";

// ——— Ranking / pool shaping (was `warHomeSignalHelpers`) ———

/** Heuristic 35–100 score from liquidity, volume, and momentum (Heat / fallback paths). */
export function computeSignalStrength(token) {
  const liq = Number(token?.liquidity || 0);
  const vol = Number(token?.volume24h || 0);
  const chg = Math.max(0, Number(token?.change || 0));
  const base = Math.min(100, liq / 8000 + vol / 25000 + chg * 1.8);
  return Math.max(35, Math.round(base));
}

export function signalFromToken(token, idx = 0) {
  const mint = token?.mint && isProbableSolanaMint(token.mint) ? token.mint : null;
  const signalStrength = computeSignalStrength(token);
  const smartWallets = Math.max(2, Math.min(9, Math.round(signalStrength / 15)));
  const context =
    idx % 2 === 0
      ? `Last similar signal -> +${Math.max(18, Math.round(signalStrength * 0.75))}% in 3h`
      : `Wallet hit rate: ${Math.max(4, Math.round(signalStrength / 20))}/6 last trades`;
  return {
    symbol: token.symbol || "TOKEN",
    mint,
    token,
    signalStrength,
    smartWallets,
    context,
    clusterScore: Math.min(99, Math.max(45, signalStrength - 6)),
    momentum: token.volume24h || 0
  };
}

export function tokenFromSignal(sig, idx = 0) {
  const source = sig?.token || {};
  const rawMint = source.mint || sig?.mint;
  const mint = rawMint && isProbableSolanaMint(rawMint) ? rawMint : null;
  const signalStrength = Number(sig?.signalStrength || computeSignalStrength(source));
  const change = Number(source?.change ?? Math.round((signalStrength - 60) / 6));
  const grade = signalStrength >= 90 ? "A+" : signalStrength >= 80 ? "A" : signalStrength >= 68 ? "B" : "C";
  return {
    symbol: source.symbol || sig?.symbol || `TOKEN${idx + 1}`,
    mint,
    grade,
    price: Number(source.price || 0),
    change,
    volume24h: Number(source.volume24h || Math.max(250000, signalStrength * 12500)),
    flowLabel: source.flowLabel || (change >= 0 ? "Buy pressure" : "Mixed flow"),
    liquidity: Number(source.liquidity || Math.max(80000, signalStrength * 1800)),
    alphaSpeedMins: Number(source.alphaSpeedMins || Math.max(3, 18 - Math.round(signalStrength / 8))),
    whyTrade: Array.isArray(source.whyTrade) ? source.whyTrade : []
  };
}

export function liquidityFromApiRedFlags(flags) {
  if (!Array.isArray(flags)) return 80000;
  const line = flags.find((f) => /liquidity/i.test(String(f)));
  if (!line) return 80000;
  const m = String(line).match(/[\d,]+/);
  if (!m) return 45000;
  return Number(m[0].replace(/,/g, "")) || 45000;
}

export function chunkArray(items, size) {
  if (!items?.length) return [];
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

// ——— Visual / decision helpers ———

export function gradeClass(grade) {
  if (grade === "A+" || grade === "A") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/25";
  if (grade === "B" || grade === "C") return "bg-amber-500/15 text-amber-200 border-amber-500/25";
  return "bg-red-500/15 text-red-300 border-red-500/25";
}

export function heatClass(score) {
  if (score >= 90) return "from-red-500 to-orange-500";
  if (score >= 70) return "from-amber-500 to-orange-400";
  return "from-blue-500 to-cyan-400";
}

export function clusterHeatEmoji(score) {
  const s = Number(score || 0);
  if (s >= 85) return "🔥🔥🔥";
  if (s >= 65) return "🔥🔥";
  return "🔥";
}

export function actionThresholds(mode) {
  if (mode === "conservative") return { high: 90, mid: 75 };
  if (mode === "aggressive") return { high: 80, mid: 62 };
  return { high: 85, mid: 68 };
}

/**
 * @param {number} signalStrength
 * @param {"balanced"|"conservative"|"aggressive"} [mode]
 * @param {"feed"|"wallet"|"token"} [variant]
 */
export function suggestedAction(signalStrength, mode = "balanced", variant = "feed") {
  const { high, mid } = actionThresholds(mode);
  if (variant === "wallet") {
    if (signalStrength >= high) return "FOLLOW";
    if (signalStrength >= mid) return "MONITOR";
    return "IGNORE";
  }
  if (variant === "token") {
    if (signalStrength >= high) return "ENTER NOW";
    if (signalStrength >= mid) return "PREPARE";
    return "STAY OUT";
  }
  if (signalStrength >= high) return "ENTER NOW";
  if (signalStrength >= mid) return "PREPARE";
  return "STAY OUT";
}

export function actionTone(signalStrength) {
  if (signalStrength >= 85) return "text-emerald-300 bg-emerald-500/10 border-emerald-500/30";
  if (signalStrength >= 65) return "text-amber-200 bg-amber-500/10 border-amber-500/30";
  return "text-red-300 bg-red-500/10 border-red-500/30";
}

/** Decision pill for feed — compact, same visual weight as adjacent coord / multi chips. */
export function feedDecisionPillClass(action, score) {
  const pulse = action === "ENTER NOW" && score > 90;
  if (action === "ENTER NOW") {
    return `text-[8px] leading-tight px-1 py-0.5 rounded border font-bold tracking-tight text-emerald-200 border-emerald-500/40 bg-emerald-500/15 ${
      pulse ? "animate-pulse" : ""
    }`;
  }
  if (action === "PREPARE") {
    return "text-[8px] leading-tight px-1 py-0.5 rounded border font-bold tracking-tight text-amber-200 border-amber-500/40 bg-amber-500/12";
  }
  return "text-[8px] leading-tight px-1 py-0.5 rounded border font-bold tracking-tight text-red-200 border-red-500/40 bg-red-500/12";
}

export function whyNowBulletLines(sig) {
  if (Array.isArray(sig?._api?.whyNow) && sig._api.whyNow.length >= 3) {
    return sig._api.whyNow.slice(0, 3);
  }
  const w = sig.token?.whyTrade;
  const third = `Hist. similar setups avg +${Math.max(18, Math.round(sig.signalStrength * 0.72))}% in first hours`;
  if (Array.isArray(w) && w.length >= 3) return w.slice(0, 3);
  if (Array.isArray(w) && w.length === 2) return [...w, third];
  if (Array.isArray(w) && w.length === 1) {
    return [w[0], `${sig.smartWallets} high-win wallets concentrated in this window`, third];
  }
  return [
    `${sig.smartWallets} high-win wallets active — tape still building, not exhausted`,
    "Liquidity depth supports entries without runaway slippage on size",
    third
  ];
}

export function confidenceLabel(signalStrength) {
  if (signalStrength >= 95) return "STRONG CONVICTION";
  if (signalStrength >= 80) return "BUILD POSITION";
  return "LOW EDGE";
}

export function confidenceDot(signalStrength) {
  if (signalStrength >= 95) return "bg-emerald-400";
  if (signalStrength >= 80) return "bg-amber-400";
  return "bg-red-400";
}

export function confidenceTone(signalStrength) {
  if (signalStrength >= 95) return "text-emerald-200 border-emerald-500/35 bg-emerald-500/10";
  if (signalStrength >= 80) return "text-amber-200 border-amber-500/35 bg-amber-500/10";
  return "text-red-200 border-red-500/35 bg-red-500/10";
}

/** Synthetic entry countdown seed (UI demo; uses Math.random). */
export function initialCountdownSec(signalStrength) {
  if (signalStrength >= 90) return 200 + Math.floor(Math.random() * 280);
  if (signalStrength >= 75) return 80 + Math.floor(Math.random() * 110);
  return 20 + Math.floor(Math.random() * 60);
}

export function entryWindowFromCountdown(sec) {
  if (sec > 180) return { label: "OPEN", detail: `${formatCountdown(sec)} left`, tone: "text-emerald-300" };
  if (sec > 0) return { label: "CLOSING", detail: `${formatCountdown(sec)} left`, tone: "text-amber-300" };
  return { label: "CLOSED", detail: "window consumed", tone: "text-red-300" };
}

export function evidenceChipsEmoji(signalStrength, token) {
  const out = ["🐋", "🧠"];
  if (signalStrength >= 82) out.push("🔥");
  if (Number(token?.liquidity || 0) < 70000) out.push("💧");
  if (Number(token?.volume24h || 0) > 500000) out.push("🤖");
  return out.slice(0, 5);
}

export function evidenceChipsForSig(sig) {
  if (Array.isArray(sig?._api?.evidenceChips) && sig._api.evidenceChips.length) {
    return sig._api.evidenceChips.map((c) => (typeof c === "string" ? c.split(" ")[0] : c));
  }
  return evidenceChipsEmoji(sig.signalStrength, sig.token || {});
}

export function entryWindowVisual(sec) {
  const s = Math.max(0, Number(sec || 0));
  if (s > 180) return { gradient: "from-emerald-500 to-emerald-400", text: "text-emerald-300" };
  if (s > 60) return { gradient: "from-amber-400 to-amber-500", text: "text-amber-300" };
  return { gradient: "from-red-600 to-red-500", text: "text-red-300" };
}

export function scoreBarGradient(strength) {
  const s = Number(strength || 0);
  if (s >= 85) return "from-emerald-400 via-lime-400 to-cyan-400";
  if (s >= 65) return "from-amber-400 to-orange-400";
  return "from-red-500 to-orange-700";
}
