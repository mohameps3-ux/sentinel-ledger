import {
  clampScore,
  deriveRiskKey,
  systemSignalKey,
  timeHorizonFromToken
} from "../../lib/scannerTerminalModel.mjs";

export function ScannerSignalStrip({ token, t }) {
  if (!token) return null;
  const score = clampScore(token.sentinelScore);
  const change = Number(token.change ?? token.change24h ?? token.priceChange24h);
  const vol = Number(token.volume24h || 0);
  const sig = systemSignalKey(score, change);
  const risk = deriveRiskKey(token, score);
  const horizon = timeHorizonFromToken(token, change, vol);

  let horizonLabel;
  if (horizon.kind === "minutes") {
    horizonLabel = t("scanner.horizon.minutes", { m: horizon.m });
  } else {
    horizonLabel = t(`scanner.horizon.${horizon.key}`);
  }

  const block = (k, vKey) => (
    <div className="min-w-0 border-l border-white/10 pl-4 first:border-l-0 first:pl-0 sm:pl-6">
      <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-500">{k}</p>
      <p className="mt-1 font-mono text-xs font-medium uppercase tracking-wide text-zinc-200">{vKey}</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 border-b border-white/10 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-start sm:px-5">
      {block(t("scanner.signal.system"), t(`scanner.signal.${sig}`))}
      {block(t("scanner.signal.risk"), t(`scanner.risk.${risk}`))}
      {block(t("scanner.signal.horizon"), horizonLabel)}
    </div>
  );
}
