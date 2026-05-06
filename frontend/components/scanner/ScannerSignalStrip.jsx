import { Clock3, Radar, ShieldCheck } from "lucide-react";
import {
  clampScore,
  deriveRiskKey,
  systemSignalKey,
  timeHorizonFromToken
} from "../../lib/scannerTerminalModel.mjs";

const signalIcons = {
  system: Radar,
  risk: ShieldCheck,
  horizon: Clock3
};

function SignalPill({ tone, label, value }) {
  const Icon = signalIcons[tone] || Radar;
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-md border border-white/[0.08] bg-black/20 px-3 py-2.5">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-zinc-400">
        <Icon size={15} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-500">{label}</p>
        <p className="mt-0.5 truncate font-mono text-xs font-medium uppercase tracking-wide text-zinc-200">{value}</p>
      </div>
    </div>
  );
}

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

  return (
    <div className="grid gap-2 border-b border-white/10 px-4 py-4 sm:px-6 lg:grid-cols-3">
      <SignalPill tone="system" label={t("scanner.signal.system")} value={t(`scanner.signal.${sig}`)} />
      <SignalPill tone="risk" label={t("scanner.signal.risk")} value={t(`scanner.risk.${risk}`)} />
      <SignalPill tone="horizon" label={t("scanner.signal.horizon")} value={horizonLabel} />
    </div>
  );
}
