import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/router";
import { useScoreSocket } from "../../hooks/useScoreSocket";
import { useTokenData } from "../../hooks/useTokenData";
import { isProbableSolanaMint } from "../../lib/solanaMint.mjs";
import { AccordionSection } from "./AccordionSection";
import {
  DeskAntiSignalBody,
  DeskContextStrip,
  DeskJupiterLinks,
  DeskQuickScan,
  DeskRadarHintStrip,
  DeskSmartMoneyLazy,
  deskAntiSummaryTone,
  useFlaggedWalletSet
} from "./IntelDeskPanels";
import { ProofOfEdgeBlock } from "@/components/cockpit/ProofOfEdgeBlock";
import { useLocale } from "../../contexts/LocaleContext";
import { buildRegimeAnalysisFromDesk } from "@/lib/tripleRiskRegime";

function clampPct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function tripleActionClass(action) {
  if (action === "BUY") return "border-emerald-500/40 bg-emerald-500/12 text-emerald-200";
  if (action === "WATCH") return "border-amber-500/40 bg-amber-500/12 text-amber-200";
  if (action === "SCALP") return "border-orange-500/40 bg-orange-500/12 text-orange-200";
  return "border-rose-500/40 bg-rose-500/10 text-rose-200";
}

function MiniBar({ label, value, gradient }) {
  const v = clampPct(value);
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 text-[9px] uppercase tracking-wider text-gray-500 font-semibold shrink-0">{label}</span>
      <div className="flex-1 h-1 rounded-full bg-black/50 overflow-hidden ring-1 ring-white/5">
        <div className={`h-full rounded-full bg-gradient-to-r ${gradient}`} style={{ width: `${v}%` }} />
      </div>
      <span className="w-7 text-right font-mono tabular-nums text-[10px] text-gray-300 shrink-0">{v}</span>
    </div>
  );
}

/**
 * Cockpit Zone C — Intel desk: live score (`useScoreSocket`) plus lazy accordions
 * backed by `useTokenData` (one REST load per pinned mint for structural intel).
 */
export function TokenDesk({ mint, deskRadarHint = null }) {
  const { t } = useLocale();
  const router = useRouter();
  const { score, isConnected } = useScoreSocket(mint || undefined);
  const tokenQuery = useTokenData(mint || "");
  const token = tokenQuery.data?.data;
  const flaggedWallets = useFlaggedWalletSet(token);
  const antiTone = deskAntiSummaryTone(token);

  const regime = useMemo(() => {
    if (!mint || !token?.market || !score) return null;
    return buildRegimeAnalysisFromDesk(token, score);
  }, [mint, token, score]);

  if (!mint) {
    return (
      <div className="flex h-full min-h-[8.25rem] sm:min-h-[12rem] flex-col items-center justify-center gap-2 px-3 sm:px-4 py-4 sm:py-8 text-center">
        <p className="text-[12px] sm:text-sm font-semibold text-gray-300">{t("cockpit.desk.selectTitle")}</p>
        <p className="text-[11px] sm:text-xs text-gray-500 max-w-xs leading-snug sm:leading-relaxed">
          {t("cockpit.desk.selectBody")}
        </p>
        <div className="w-full max-w-xs sm:max-w-sm text-left">
          <AccordionSection title={t("cockpit.desk.quickScan")} summaryTone="neutral" defaultOpen={false}>
            <DeskQuickScan currentMint={null} />
          </AccordionSection>
        </div>
      </div>
    );
  }

  const scores = score?.scores;
  const conf = score?.confidence;
  const confLabel = score?.confidenceLabel;
  const regimeKey =
    score?.meta?.emissionGate?.regime && typeof score.meta.emissionGate.regime === "object"
      ? String(score.meta.emissionGate.regime.key || "").trim() || null
      : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3 sm:p-4 overflow-y-auto">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/[0.08] pb-2 shrink-0">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500 font-semibold">{t("cockpit.desk.intelLabel")}</p>
          <p className="font-mono text-xs text-cyan-200/90 truncate mt-1" title={mint}>
            {mint.slice(0, 6)}…{mint.slice(-4)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
              isConnected ? "border-emerald-500/35 text-emerald-200 bg-emerald-500/10" : "border-amber-500/30 text-amber-200 bg-amber-500/10"
            }`}
          >
            {isConnected ? t("cockpit.desk.live") : t("cockpit.desk.syncing")}
          </span>
          <Link
            href={`/token/${mint}`}
            className="text-[10px] px-2 py-0.5 rounded-lg border border-emerald-500/25 text-emerald-200/90 hover:text-emerald-100 hover:border-emerald-400/40 font-semibold"
          >
            {t("cockpit.desk.openTerminal")}
          </Link>
          <button
            type="button"
            onClick={() => router.push("/", undefined, { shallow: true })}
            className="text-[10px] px-2 py-0.5 rounded-lg border border-white/12 text-gray-400 hover:text-gray-200 hover:border-white/20"
          >
            {t("cockpit.desk.clear")}
          </button>
        </div>
      </div>

      {deskRadarHint ? <DeskRadarHintStrip hint={deskRadarHint} /> : null}

      {tokenQuery.isPending ? (
        <p className="text-[11px] text-gray-500 shrink-0">{t("cockpit.desk.loadingToken")}</p>
      ) : tokenQuery.isError ? (
        <p className="text-[11px] text-amber-200/90 shrink-0">{t("cockpit.desk.tokenError")}</p>
      ) : token ? (
        <div className="shrink-0">
          <DeskContextStrip token={token} />
        </div>
      ) : null}

      {!score?.scores ? (
        <p className="text-sm text-gray-500 shrink-0">{t("cockpit.desk.waitingScore")}</p>
      ) : (
        <div className="space-y-2 min-w-0 shrink-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{t("cockpit.desk.confidence")}</span>
            <span className="text-lg font-black font-mono tabular-nums text-white">
              {conf != null && Number.isFinite(Number(conf)) ? `${Math.round(Number(conf))}%` : "—"}
            </span>
          </div>
          {confLabel ? <p className="text-[11px] text-gray-400 truncate">{String(confLabel)}</p> : null}
          <div className="space-y-2 rounded-lg border border-white/[0.08] bg-black/25 p-2.5">
            <MiniBar label="RSK" value={scores.risk} gradient="from-rose-500 via-red-500 to-orange-400" />
            <MiniBar label="SMT" value={scores.smart} gradient="from-emerald-400 via-lime-400 to-cyan-400" />
            <MiniBar label="MOM" value={scores.momentum} gradient="from-amber-300 via-amber-400 to-orange-400" />
          </div>
          {score.__verification ? (
            <p className="text-[10px] text-gray-500 font-mono">
              {t("cockpit.desk.integrity")} <span className="text-gray-300">{String(score.__verification)}</span>
            </p>
          ) : null}
          {regime ? (
            <div className="space-y-2 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.04] p-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[9px] uppercase tracking-[0.1em] text-cyan-200/80 font-semibold leading-tight">
                  {t("cockpit.desk.tripleTitle")}
                </p>
              </div>
              <p className="text-[9px] text-gray-500 leading-snug">{t("cockpit.desk.tripleAdvisory")}</p>
              {regime.missing?.includes("poolAge") ? (
                <p className="text-[9px] text-amber-200/80 leading-snug">{t("cockpit.desk.triplePoolAgeNote")}</p>
              ) : null}
              <div className="space-y-1.5">
                <MiniBar
                  label={t("cockpit.desk.barSignal")}
                  value={regime.signalScore}
                  gradient="from-cyan-400 via-sky-400 to-blue-500"
                />
                <MiniBar
                  label={t("cockpit.desk.barExecution")}
                  value={regime.executionScore}
                  gradient="from-emerald-500 via-lime-500 to-amber-400"
                />
                <MiniBar
                  label={t("cockpit.desk.barOverheat")}
                  value={regime.overheatScore}
                  gradient="from-orange-500 to-red-500"
                />
              </div>
              <p className="text-[10px] text-gray-400 leading-snug">
                {t(`cockpit.desk.tripleContext.${regime.contextLabelId}`) || regime.contextLabelId}
              </p>
              <div
                className={`w-full text-center text-[10px] sm:text-[11px] font-bold tracking-tight py-1.5 px-2 rounded-lg border ${tripleActionClass(
                  regime.action
                )}`}
              >
                {t(`cockpit.desk.tripleAction.${regime.action}`) || regime.action}
              </div>
            </div>
          ) : null}
        </div>
      )}

      <div className="flex flex-col gap-2 pt-1 min-h-0">
        <div className="rounded-lg border border-white/[0.08] bg-black/[0.18] px-3 py-2.5 shrink-0">
          <p className="text-[10px] uppercase tracking-[0.12em] text-gray-500 font-semibold mb-2">{t("cockpit.desk.jupiterTitle")}</p>
          <DeskJupiterLinks mint={mint} />
        </div>

        <ProofOfEdgeBlock mint={mint} confidence={conf != null && Number.isFinite(Number(conf)) ? Number(conf) : null} regime={regimeKey} />

        <AccordionSection title={t("cockpit.desk.smartWallets")} summaryTone="neutral">
          {isProbableSolanaMint(mint) ? (
            <DeskSmartMoneyLazy mint={mint} flaggedWallets={flaggedWallets} />
          ) : (
            <p className="text-xs text-gray-500">{t("cockpit.desk.invalidMint")}</p>
          )}
        </AccordionSection>

        <AccordionSection title={t("cockpit.desk.antiSignal")} summaryTone={antiTone}>
          <DeskAntiSignalBody token={token} />
        </AccordionSection>

        <AccordionSection title={t("cockpit.desk.quickScan")} summaryTone="neutral">
          <DeskQuickScan currentMint={mint} />
        </AccordionSection>
      </div>

    </div>
  );
}
