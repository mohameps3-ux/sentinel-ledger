import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useMarketStore, scoreSnapshot } from "@/lib/store/marketStore";
import { useScoreRoom } from "@/hooks/useScoreRoom";
import { useTokenData } from "../../hooks/useTokenData";
import { isProbableSolanaMint } from "../../lib/solanaMint.mjs";
import { resolveTokenImageUrl } from "../../lib/resolveTokenImageUrl";
import { formatTokenPrice, formatUsdWhole } from "../../lib/formatStable";
import {
  buildDexscreenerSolanaTokenUrl,
  buildMeteoraPoolUrl,
  buildPumpFunTokenUrl,
  buildSolscanTokenUrl,
  EXTERNAL_ANCHOR_REL
} from "../../lib/terminalLinks";
import { pairCreatedRawToUnixMs, poolAgeMinutesFromCreatedMs } from "@/lib/pairTime";
import { AccordionSection } from "./AccordionSection";
import {
  DeskAntiSignalBody,
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

function tripleActionTextClass(action) {
  if (action === "BUY") return "text-emerald-200";
  if (action === "WATCH") return "text-amber-200";
  if (action === "SCALP") return "text-orange-200";
  return "text-rose-200";
}

function MiniBar({ label, value, gradient }) {
  const v = clampPct(value);
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 text-[9px] uppercase tracking-wider text-gray-500 font-semibold shrink-0">{label}</span>
      <div className="flex-1 h-1 rounded-full bg-black/50 overflow-hidden ring-1 ring-white/5">
        <div className={`h-full rounded-full bg-gradient-to-r ${gradient}`} style={{ width: `${v}%` }} />
      </div>
      <span className="w-12 text-right font-mono tabular-nums text-[10px] text-gray-300 shrink-0 flex items-baseline justify-end gap-0.5">
        <span>{v}</span>
        <span className="text-[9px] text-gray-500 font-normal">/100</span>
      </span>
    </div>
  );
}

function DeskSection({ title, children, className = "" }) {
  return (
    <section className={`shrink-0 space-y-2 ${className}`.trim()}>
      <h3 className="text-[10px] uppercase tracking-[0.14em] text-gray-500 font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function DeskStat({ label, value, valueClassName = "text-gray-100" }) {
  return (
    <div className="border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 min-h-[2.75rem]">
      <p className="text-[9px] uppercase tracking-[0.12em] text-gray-500 font-medium">{label}</p>
      <p className={`mt-0.5 font-mono text-[11px] tabular-nums leading-tight ${valueClassName}`}>{value}</p>
    </div>
  );
}

function formatPctChange(raw) {
  const v = Number(raw);
  if (!Number.isFinite(v)) return null;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function formatPoolAgeLabel(market) {
  const ms = pairCreatedRawToUnixMs(market?.pairCreatedAt);
  if (ms == null) return null;
  const mins = poolAgeMinutesFromCreatedMs(ms);
  if (mins < 90) return `${Math.round(mins)}m`;
  if (mins < 60 * 48) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / (60 * 24))}d`;
}

function marketUsd(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `$${formatUsdWhole(n)}`;
}

function marketPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `$${formatTokenPrice(n)}`;
}

function findMeteoraPool(token) {
  const pairs = Array.isArray(token?.market?.dexPairs) ? token.market.dexPairs : [];
  const pair = pairs.find((p) => String(p?.dexId || "").toLowerCase().includes("meteora") && p?.pairAddress);
  return pair?.pairAddress || null;
}

function hasPumpRoute(token) {
  const pairs = Array.isArray(token?.market?.dexPairs) ? token.market.dexPairs : [];
  const pairUrl = String(token?.market?.pairUrl || "").toLowerCase();
  return pairUrl.includes("pump.fun") || pairs.some((p) => String(p?.dexId || "").toLowerCase().includes("pump"));
}

function DeskIdentity({ token, mint, imageBroken, onImageError }) {
  const imageUrl = resolveTokenImageUrl(token);
  const symbol = String(token?.market?.symbol || token?.symbol || "—").replace(/^\$/, "");
  const name = token?.market?.name ? String(token.market.name) : null;
  const dim = 52;

  return (
    <div className="flex items-start gap-3">
      {imageUrl && !imageBroken ? (
        <img
          src={imageUrl}
          alt=""
          width={dim}
          height={dim}
          className="shrink-0 rounded-full object-cover bg-white/[0.03] border border-white/[0.12] ring-1 ring-white/[0.06]"
          loading="lazy"
          decoding="async"
          onError={onImageError}
        />
      ) : (
        <div
          className="shrink-0 rounded-full bg-white/[0.04] border border-white/[0.1] ring-1 ring-white/[0.06]"
          style={{ width: dim, height: dim }}
          aria-hidden
        />
      )}
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-lg font-bold text-white tracking-tight leading-none">${symbol}</p>
        {name ? <p className="mt-1 text-[11px] text-gray-400 truncate leading-snug">{name}</p> : null}
      </div>
    </div>
  );
}

function DeskMintRow({ mint, copied, onCopy }) {
  return (
    <div className="flex items-center gap-2 mt-2">
      <p className="font-mono text-[10px] text-gray-400 truncate flex-1 min-w-0" title={mint}>
        {mint.slice(0, 8)}…{mint.slice(-8)}
      </p>
      <button
        type="button"
        onClick={onCopy}
        className="shrink-0 text-[10px] px-2 py-0.5 border border-white/12 text-gray-400 hover:text-gray-200 hover:border-white/22"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function DeskVerdict({ hasEngineScore, conf, confLabel, regime, t }) {
  if (!hasEngineScore) {
    return (
      <div className="rounded-md border border-white/[0.08] bg-black/30 px-3 py-4 text-center">
        <p className="text-base font-semibold text-gray-200 tracking-tight">Not evaluated yet</p>
        <p className="mt-1.5 text-[11px] text-gray-500 leading-relaxed max-w-[16rem] mx-auto">
          Sentinel&apos;s scoring engine has not produced a live evaluation for this mint.
        </p>
      </div>
    );
  }

  const confPct = conf != null && Number.isFinite(Number(conf)) ? `${Math.round(Number(conf))}%` : "—";
  const action = regime?.action;
  const actionLabel = action ? t(`cockpit.desk.tripleAction.${action}`) || action : null;

  return (
    <div
      className="rounded-md border border-white/[0.1] bg-gradient-to-b from-white/[0.04] to-black/40 px-3 py-3 space-y-1.5"
      aria-label={
        actionLabel
          ? `${actionLabel}. ${t("cockpit.desk.confidence")} ${confPct}${confLabel ? `, ${confLabel} tier` : ""}`
          : `${t("cockpit.desk.confidence")} ${confPct}${confLabel ? `, ${confLabel} tier` : ""}`
      }
    >
      {actionLabel ? (
        <p className={`text-xl sm:text-2xl font-black tracking-tight leading-tight ${tripleActionTextClass(action)}`}>
          {actionLabel}
        </p>
      ) : (
        <p className="text-xl sm:text-2xl font-black tracking-tight text-gray-300 leading-tight">—</p>
      )}
      <p className="text-xs text-gray-400 leading-snug">
        {t("cockpit.desk.confidence")}: {confPct}
        {confLabel ? (
          <>
            {" · "}
            {String(confLabel)} tier
          </>
        ) : null}
      </p>
      {!regime ? (
        <p className="text-[10px] text-gray-500 leading-snug pt-0.5">Execution regime pending market context.</p>
      ) : null}
    </div>
  );
}

function DeskMarketGrid({ token, tokenQuery, t }) {
  const market = token?.market;
  const price = marketPrice(market?.price);
  const chgRaw = market?.priceChange24h;
  const chgFmt = formatPctChange(chgRaw);
  const chgTone =
    chgFmt == null
      ? "text-gray-400"
      : Number(chgRaw) >= 0
        ? "text-emerald-400"
        : "text-red-400";
  const liq = marketUsd(market?.liquidityUsd ?? market?.liquidity);
  const vol = marketUsd(market?.volume24hUsd ?? market?.volume24h);
  const mcap = marketUsd(market?.marketCap);
  const poolAge = formatPoolAgeLabel(market);

  return (
    <div className="space-y-2">
      {tokenQuery.isPending ? (
        <p className="text-[11px] text-gray-500">{t("cockpit.desk.loadingToken")}</p>
      ) : null}
      {tokenQuery.isError ? (
        <p className="text-[11px] text-amber-200/90">{t("cockpit.desk.tokenError")}</p>
      ) : null}
      <div className="grid grid-cols-2 gap-1.5">
        <DeskStat label="Price" value={price ?? "—"} />
        <DeskStat label="24h change" value={chgFmt ?? "—"} valueClassName={chgTone} />
        <DeskStat label="Liquidity" value={liq ?? "—"} />
        <DeskStat label="24h volume" value={vol ?? "—"} />
        <DeskStat label="Market cap" value={mcap ?? "—"} />
        <DeskStat label="Pool age" value={poolAge ?? "—"} />
      </div>
    </div>
  );
}

function DeskSentinelAnalysis({ hasEngineScore, scores, score, regime, t }) {
  if (!hasEngineScore) {
    return (
      <p className="text-[11px] text-gray-500 border border-white/[0.06] rounded-md px-2.5 py-2 bg-black/20">
        Engine analysis unavailable until this mint is scored.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="space-y-2 border border-white/[0.08] bg-black/25 p-2.5 rounded-md">
        <MiniBar label="Risk" value={scores.risk} gradient="from-rose-500 via-red-500 to-orange-400" />
        <MiniBar label="Smart Money" value={scores.smart} gradient="from-emerald-400 via-lime-400 to-cyan-400" />
        <MiniBar label="Momentum" value={scores.momentum} gradient="from-amber-300 via-amber-400 to-orange-400" />
        <p className="text-[9px] sm:text-[10px] text-gray-500 leading-snug mt-2 border-t border-white/[0.05] pt-2 font-mono">
          {t("cockpit.desk.scoreLegend")}
        </p>
      </div>
      {score.__verification ? (
        <p className="text-[10px] text-gray-500 font-mono">
          {t("cockpit.desk.integrity")} <span className="text-gray-300">{String(score.__verification)}</span>
        </p>
      ) : null}
      {regime ? (
        <div className="space-y-2 border border-cyan-500/20 bg-cyan-500/[0.04] p-2.5 rounded-md">
          <p className="text-[9px] uppercase tracking-[0.1em] text-cyan-200/80 font-semibold leading-tight">
            {t("cockpit.desk.tripleTitle")}
          </p>
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
          <p className="text-[9px] sm:text-[10px] text-gray-500 leading-snug mt-2 border-t border-white/[0.05] pt-2 font-mono">
            {t("cockpit.desk.scoreLegend")}
          </p>
          <p className="text-[10px] text-gray-400 leading-snug">
            {t(`cockpit.desk.tripleContext.${regime.contextLabelId}`) || regime.contextLabelId}
          </p>
          <p className="text-[9px] sm:text-[10px] text-gray-600 leading-relaxed mt-2 border-t border-white/[0.05] pt-2 italic">
            {t("cockpit.desk.tripleAdvisory")}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function DeskExternalLinks({ mint, token, t }) {
  if (!mint || !isProbableSolanaMint(mint)) return null;
  const dexUrl = buildDexscreenerSolanaTokenUrl(mint);
  const solscanUrl = buildSolscanTokenUrl(mint);
  const pumpUrl = hasPumpRoute(token) ? buildPumpFunTokenUrl(mint) : null;
  const meteoraUrl = buildMeteoraPoolUrl(findMeteoraPool(token));
  const linkClass =
    "text-[10px] text-gray-500 hover:text-gray-300 underline underline-offset-2 decoration-white/20";

  return (
    <div className="pt-2 border-t border-white/[0.06] space-y-2">
      <p className="text-[9px] uppercase tracking-[0.14em] text-gray-600 font-semibold">External</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <a href={dexUrl} target="_blank" rel={EXTERNAL_ANCHOR_REL} className={linkClass}>
          {t("cockpit.desk.marketsLink")}
        </a>
        <span className="text-gray-700 text-[10px]" aria-hidden>
          ·
        </span>
        <a href={solscanUrl} target="_blank" rel={EXTERNAL_ANCHOR_REL} className={linkClass}>
          Solscan
        </a>
        {pumpUrl ? (
          <>
            <span className="text-gray-700 text-[10px]" aria-hidden>
              ·
            </span>
            <a href={pumpUrl} target="_blank" rel={EXTERNAL_ANCHOR_REL} className={linkClass}>
              Pump
            </a>
          </>
        ) : null}
        {meteoraUrl ? (
          <>
            <span className="text-gray-700 text-[10px]" aria-hidden>
              ·
            </span>
            <a href={meteoraUrl} target="_blank" rel={EXTERNAL_ANCHOR_REL} className={linkClass}>
              Meteora
            </a>
          </>
        ) : null}
      </div>
      <Link href={`/token/${encodeURIComponent(mint)}`} className={`inline-block ${linkClass}`}>
        {t("cockpit.desk.openTerminal")} →
      </Link>
    </div>
  );
}

/**
 * Cockpit Zone C — Intel desk: live score from global marketStore plus lazy accordions
 * backed by `useTokenData` (one REST load per pinned mint for structural intel).
 */
export function TokenDesk({ mint, deskRadarHint = null }) {
  const { t } = useLocale();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [imageBroken, setImageBroken] = useState(false);
  useEffect(() => {
    setImageBroken(false);
    setCopied(false);
  }, [mint]);
  useScoreRoom(mint || undefined);
  const scoreEntry = useMarketStore((s) => (mint ? s.scores.get(mint) : undefined));
  const isConnected = useMarketStore((s) => s.scoreSocketConnected);
  const narrative = useMarketStore((s) => (mint ? s.narratives.get(mint) : undefined));
  const score = scoreEntry?.scores ? scoreSnapshot(scoreEntry) : null;
  const hasEngineScore = Boolean(score?.scores);
  const tokenQuery = useTokenData(mint || "");
  const token = tokenQuery.data?.data;
  const flaggedWallets = useFlaggedWalletSet(token);
  const antiTone = deskAntiSummaryTone(token);

  const regime = useMemo(() => {
    if (!mint || !token?.market || !score) return null;
    return buildRegimeAnalysisFromDesk(token, score);
  }, [mint, token, score]);

  const onCopyMint = useCallback(async () => {
    if (!mint || typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(mint);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [mint]);

  if (!mint) {
    return (
      <div className="flex h-full min-h-[8.25rem] sm:min-h-[12rem] flex-col items-center justify-center gap-2 px-3 sm:px-4 py-4 sm:py-8 text-center overflow-y-auto">
        <p className="text-sm font-semibold text-gray-200">{t("cockpit.desk.selectTitle")}</p>
        <p className="text-[11px] sm:text-xs text-gray-500 max-w-xs leading-snug sm:leading-relaxed">{t("cockpit.desk.selectBody")}</p>
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
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <div className="flex flex-col gap-4 p-3 sm:p-4 pb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-2 shrink-0">
          <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500 font-semibold">{t("cockpit.desk.intelLabel")}</p>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                isConnected ? "border-emerald-500/35 text-emerald-200 bg-emerald-500/10" : "border-amber-500/30 text-amber-200 bg-amber-500/10"
              }`}
            >
              {isConnected ? t("cockpit.desk.live") : t("cockpit.desk.syncing")}
            </span>
            <button
              type="button"
              onClick={() => router.push("/", undefined, { shallow: true })}
              className="text-[10px] px-2 py-0.5 border border-white/12 text-gray-400 hover:text-gray-200 hover:border-white/20"
            >
              {t("cockpit.desk.clear")}
            </button>
          </div>
        </div>

        {deskRadarHint ? <DeskRadarHintStrip hint={deskRadarHint} /> : null}

        <DeskSection title="Token overview">
          <DeskIdentity token={token} mint={mint} imageBroken={imageBroken} onImageError={() => setImageBroken(true)} />
          <DeskMintRow mint={mint} copied={copied} onCopy={onCopyMint} />
        </DeskSection>

        <DeskSection title="Conviction">
          <DeskVerdict hasEngineScore={hasEngineScore} conf={conf} confLabel={confLabel} regime={regime} t={t} />
          {narrative?.message ? (
            <div className="sentinel-narrative narrative-tactical text-[11px] leading-snug">{narrative.message}</div>
          ) : null}
        </DeskSection>
        <DeskSection title="Smart Money">
          {isProbableSolanaMint(mint) ? (
            <DeskSmartMoneyLazy mint={mint} flaggedWallets={flaggedWallets} />
          ) : (
            <p className="text-xs text-gray-500">{t("cockpit.desk.invalidMint")}</p>
          )}
        </DeskSection>

        <DeskSection title="Market">
          
          <DeskMarketGrid token={token} tokenQuery={tokenQuery} t={t} />
        </DeskSection>

        <AccordionSection title="Risk" summaryTone={antiTone} defaultOpen={false}>
          <DeskAntiSignalBody token={token} />
        </AccordionSection>

        <DeskSection title="Signal Intelligence">
          <DeskSentinelAnalysis hasEngineScore={hasEngineScore} scores={scores} score={score} regime={regime} t={t} />
        </DeskSection>

        <DeskSection title="Oracle Outcomes">
          <ProofOfEdgeBlock mint={mint} confidence={conf != null && Number.isFinite(Number(conf)) ? Number(conf) : null} regime={regimeKey} />
        </DeskSection>

        <DeskSection title="Actions">
          <div className="border border-white/[0.08] bg-black/[0.18] px-3 py-2.5 rounded-md">
            <p className="text-[10px] uppercase tracking-[0.12em] text-gray-500 font-semibold mb-2">{t("cockpit.desk.jupiterTitle")}</p>
            <DeskJupiterLinks mint={mint} />
          </div>
        </DeskSection>

        <DeskExternalLinks mint={mint} token={token} t={t} />

        <div className="flex flex-col gap-2 pt-1 border-t border-white/[0.06]">
          <AccordionSection title={t("cockpit.desk.quickScan")} summaryTone="neutral" defaultOpen={false}>
            <DeskQuickScan currentMint={mint} />
          </AccordionSection>
        </div>
      </div>
    </div>
  );
}
