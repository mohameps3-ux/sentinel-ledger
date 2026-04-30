import { useEffect, useMemo, useRef, useState } from "react";
import { useMarketStore, isScoreFresh } from "@/lib/store/marketStore";
import { useScoreRoom } from "@/hooks/useScoreRoom";
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
  /** War-mode cards use a minimal layout; hide the execution strip. */
  hideExecutionBar = false,
  children,
  ...rest
}) {
  useScoreRoom(mint && isProbableSolanaMint(mint) ? mint : undefined);
  const scoreEntry = useMarketStore((s) =>
    mint && isProbableSolanaMint(mint) ? s.scores.get(mint) : undefined
  );
  const narrative = useMarketStore((s) =>
    mint && isProbableSolanaMint(mint) ? s.narratives.get(mint) : undefined
  );
  const [, setNowTick] = useState(0);
  const now = Date.now();
  const isFresh = isScoreFresh(scoreEntry, now);
  const liveScore = isFresh
    ? clampScore(
        Number.isFinite(Number(scoreEntry?.confidence))
          ? scoreEntry.confidence
          : scoreEntry?.score
      )
    : null;
  const staticClamped = clampScore(staticScore);
  const staticScoreSafe = staticClamped ?? 0;
  const targetScore = liveScore != null ? liveScore : staticScoreSafe;
  const [displayScore, setDisplayScore] = useState(targetScore);
  const [flash, setFlash] = useState(null);
  const lastAnimatedAtRef = useRef(0);
  const renderedScoreRef = useRef(targetScore);
  const flashTimerRef = useRef(null);

  useEffect(() => {
    const ts = scoreEntry?._ts;
    if (ts == null || !Number.isFinite(Number(ts))) return undefined;
    const msUntilStale = Math.max(0, Number(ts) + STALE_AFTER_MS - Date.now() + 50);
    const timer = window.setTimeout(() => setNowTick((x) => x + 1), msUntilStale);
    return () => window.clearTimeout(timer);
  }, [scoreEntry?._ts]);

  useEffect(() => {
    setNowTick((x) => x + 1);
  }, [scoreEntry?.score, scoreEntry?._ts]);

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

  const action = useMemo(() => normalizeAction(actionKey), [actionKey]);
  const smCount = Math.max(0, Math.round(Number(smartMoneyCount) || 0));
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
      {typeof children === "function"
        ? children({ displayScore, isFresh, smartMoneyCount: smCount, narrative: narrative ?? null })
        : children}
      {hideExecutionBar ? null : (
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-0 h-[3px] ${bottomBarClass(action)}`}
          title={`Execution state: ${action}${isFresh ? "" : " · stale/static"}`}
          aria-hidden
        />
      )}
    </WatchedCardShell>
  );
}
