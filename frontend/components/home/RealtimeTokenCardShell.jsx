import { useEffect, useMemo, useRef, useState } from "react";
import { useScoreSocket } from "../../hooks/useScoreSocket";
import { isProbableSolanaMint } from "../../lib/solanaMint.mjs";
import { WatchedCardShell } from "./WatchedCardShell";

const STALE_AFTER_MS = 120 * 1000;
const MIN_ANIMATION_GAP_MS = 3000;
const FLASH_MS = 300;

function clampScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function liveScoreFromPayload(score) {
  return clampScore(score?.confidence ?? score?.sentinelScore ?? score?.score ?? score?.scores?.smart);
}

function smartMoneyCountFromPayload(score, fallback) {
  const candidates = [
    score?.smartMoneyCount,
    score?.smartWallets,
    score?.smart_wallets,
    Array.isArray(score?.smartMoney) ? score.smartMoney.length : null,
    Array.isArray(score?.wallets) ? score.wallets.length : null,
    fallback
  ];
  for (const candidate of candidates) {
    const n = Number(candidate);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return 0;
}

function normalizeAction(action) {
  const raw = String(action || "").trim().toUpperCase();
  if (["ACCUMULATE", "BUY", "ENTER NOW", "ENTER_NOW", "LONG"].includes(raw)) return "ACCUMULATE";
  if (["TOO LATE", "TOO_LATE", "STAY OUT", "STAY_OUT", "AVOID", "MARKET_ONLY"].includes(raw)) return "TOO LATE";
  return "WATCH";
}

function bottomBarClass(action) {
  if (action === "ACCUMULATE") return "bg-indigo-500";
  if (action === "TOO LATE") return "bg-red-500";
  return "bg-amber-400";
}

export function RealtimeTokenCardShell({
  mint,
  staticScore,
  actionKey,
  smartMoneyCount = 0,
  baseClassName = "",
  watchedClassName = "",
  children,
  ...rest
}) {
  const canSubscribe = mint && isProbableSolanaMint(mint);
  const { score, lastScoreAt } = useScoreSocket(canSubscribe ? mint : undefined);
  const [now, setNow] = useState(Date.now());
  const staticScoreSafe = clampScore(staticScore) ?? 0;
  const liveScore = liveScoreFromPayload(score);
  const isFresh = Boolean(lastScoreAt && now - lastScoreAt <= STALE_AFTER_MS);
  const targetScore = isFresh && liveScore != null ? liveScore : staticScoreSafe;
  const [displayScore, setDisplayScore] = useState(targetScore);
  const [flash, setFlash] = useState(null);
  const lastAnimatedAtRef = useRef(0);
  const renderedScoreRef = useRef(targetScore);
  const flashTimerRef = useRef(null);

  useEffect(() => {
    const last = Number(lastScoreAt);
    if (!Number.isFinite(last) || last <= 0) return undefined;
    const msUntilStale = Math.max(0, last + STALE_AFTER_MS - Date.now() + 50);
    const timer = window.setTimeout(() => setNow(Date.now()), msUntilStale);
    return () => window.clearTimeout(timer);
  }, [lastScoreAt]);

  useEffect(() => {
    setNow(Date.now());
  }, [score]);

  useEffect(() => {
    if (!isFresh) {
      renderedScoreRef.current = staticScoreSafe;
      setDisplayScore(staticScoreSafe);
      setFlash(null);
      return undefined;
    }

    const previous = renderedScoreRef.current;
    if (targetScore === previous) return undefined;

    const nowMs = Date.now();
    if (nowMs - lastAnimatedAtRef.current < MIN_ANIMATION_GAP_MS) return undefined;

    renderedScoreRef.current = targetScore;
    lastAnimatedAtRef.current = nowMs;
    setDisplayScore(targetScore);
    setFlash(targetScore > previous ? "up" : "down");

    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setFlash(null), FLASH_MS);
    return undefined;
  }, [isFresh, staticScoreSafe, targetScore]);

  useEffect(
    () => () => {
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    },
    []
  );

  const action = useMemo(
    () => normalizeAction(score?.suggestedAction || score?.action || score?.decision || actionKey),
    [actionKey, score?.action, score?.decision, score?.suggestedAction]
  );
  const smCount = smartMoneyCountFromPayload(score, smartMoneyCount);
  const flashClass =
    flash === "up"
      ? "!border-emerald-400/90 shadow-[0_0_22px_rgba(16,185,129,0.32)]"
      : flash === "down"
        ? "!border-red-400/90 shadow-[0_0_22px_rgba(248,113,113,0.3)]"
        : "";

  return (
    <WatchedCardShell
      mint={mint}
      baseClassName={`${baseClassName} relative overflow-hidden pb-2 ${flashClass}`.trim()}
      watchedClassName={watchedClassName}
      data-live-stale={isFresh ? undefined : "1"}
      {...rest}
    >
      {typeof children === "function" ? children({ displayScore, isFresh, smartMoneyCount: smCount }) : children}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-[3px] ${bottomBarClass(action)}`}
        title={`Execution state: ${action}${isFresh ? "" : " · stale/static"}`}
        aria-hidden
      />
    </WatchedCardShell>
  );
}
