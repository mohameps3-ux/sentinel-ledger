import React, { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { useMarketStore } from "@/lib/store/marketStore";
import { useSortedTokens } from "@/hooks/useSortedTokens";
import { narrativeFromData } from "@/lib/narrativeFromData";

function SmartMoneyFlow({ tok }) {
  if (!tok) return null;

  const wallets = tok.smartMoneyCount ?? tok.smartWallets ?? 0;
  const change = tok.priceChange24h ?? tok.change24h ?? 0;
  const liq = tok.liquidityUsd ?? tok.liquidity ?? 0;
  const score = tok._currentScore ?? tok.sentinelScore ?? 0;
  const symbol = tok.symbol ?? tok.name ?? "TOKEN";

  const baseBuy = change >= 0
    ? Math.min(90, 55 + Math.round(Math.abs(change) * 0.3) + wallets * 3)
    : Math.max(25, 50 - Math.round(Math.abs(change) * 0.4));
  const buyPct = Math.min(95, Math.max(5, baseBuy));
  const sellPct = 100 - buyPct;

  const events = [];
  if (wallets >= 1) {
    events.push({
      type: "buy",
      text: `${wallets} smart wallet${wallets > 1 ? "s" : ""} accumulating`,
      time: "< 1m",
      size: "large"
    });
  }
  if (change >= 20) {
    events.push({
      type: "buy",
      text: `Volume spike +${Math.round(change)}%`,
      time: "2m ago",
      size: "medium"
    });
  }
  if (score >= 85 && wallets === 0) {
    events.push({
      type: "buy",
      text: `High conviction signal detected`,
      time: "3m ago",
      size: "small"
    });
  }
  if (liq > 100_000) {
    events.push({
      type: "buy",
      text: `Liquidity holding at $${(liq / 1000).toFixed(0)}K`,
      time: "5m ago",
      size: "small"
    });
  }
  if (change < 0 && Math.abs(change) > 10) {
    events.push({
      type: "sell",
      text: `Price down ${Math.round(Math.abs(change))}%`,
      time: "4m ago",
      size: "medium"
    });
  }
  if (events.length === 0) {
    events.push({
      type: "neutral",
      text: `Monitoring ${symbol}`,
      time: "now",
      size: "small"
    });
  }

  return (
    <div className="war-aside-section war-smflow">
      <div className="war-aside-title">
        ⬤ SMART MONEY FLOW
        <span className="war-smflow-live">LIVE</span>
      </div>

      <div className="war-pressure-row">
        <div className="war-pressure-labels">
          <span className="war-pressure-buy">BUY {buyPct}%</span>
          <span className="war-pressure-sell">SELL {sellPct}%</span>
        </div>
        <div className="war-pressure-bar">
          <div className="war-pressure-fill-buy" style={{ width: `${buyPct}%` }} />
          <div className="war-pressure-fill-sell" style={{ width: `${sellPct}%` }} />
        </div>
      </div>

      <div className="war-smflow-events">
        {events.slice(0, 4).map((ev, i) => (
          <div key={i} className={`war-smflow-event war-smflow-${ev.type}`}>
            <span className={`war-smflow-dot war-smflow-dot-${ev.type}`} />
            <span className="war-smflow-text">{ev.text}</span>
            <span className="war-smflow-time">{ev.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function getIntentLevel(score) {
  if (score >= 85) return { label: "EXTREME", cls: "intent-extreme" };
  if (score >= 70) return { label: "HIGH", cls: "intent-high" };
  if (score >= 50) return { label: "MEDIUM", cls: "intent-medium" };
  return { label: "LOW", cls: "intent-low" };
}

function getAction(score, action) {
  const a = action ?? "WATCH";
  if (a === "BUY" || a === "ENTER NOW" || score >= 85)
    return {
      label: "🚀 STRONG BUY",
      cls: "war-opp-buy",
      target: score >= 85 ? "3–5x" : "2–3x",
      time: score >= 85 ? "< 30m" : "30m – 2h"
    };
  if (a === "SCALP" || score >= 70)
    return {
      label: "⚡ SCALP",
      cls: "war-opp-scalp",
      target: "1–2x",
      time: "< 15m"
    };
  if (a === "WATCH" || a === "PREPARE")
    return {
      label: "👁 WATCH",
      cls: "war-opp-watch",
      target: "1–2x",
      time: "1 – 3h"
    };
  return {
    label: "✕ STAY OUT",
    cls: "war-opp-avoid",
    target: "N/A",
    time: "N/A"
  };
}

function getPatternChips(tok) {
  const chips = [];
  const score = tok._currentScore ?? tok.sentinelScore ?? 0;
  const wallets = tok.smartMoneyCount ?? tok.smartWallets ?? 0;
  const change = tok.priceChange24h ?? tok.change24h ?? 0;
  const liq = tok.liquidityUsd ?? tok.liquidity ?? 0;
  const age = tok.poolAgeMinutes ?? null;

  if (wallets >= 3) chips.push({ label: "EARLY ACCUMULATION", cls: "chip-green" });
  else if (wallets >= 1) chips.push({ label: "MOMENTUM BUILDING", cls: "chip-amber" });

  if (age !== null && age < 30) chips.push({ label: "NEW POOL", cls: "chip-blue" });
  if (liq > 500_000) chips.push({ label: "LOCKED LP", cls: "chip-green" });
  if (change >= 50) chips.push({ label: `+${Math.round(change)}% 24H`, cls: "chip-amber" });
  if (score < 50) chips.push({ label: "HIGH RISK", cls: "chip-red" });
  if (wallets === 0 && score >= 85) chips.push({ label: "STEADY ACCUMULATION", cls: "chip-blue" });

  return chips.slice(0, 3);
}

function tokenImageUrl(tok) {
  return (
    tok.imageUrl ??
    tok.image ??
    tok.logoURI ??
    tok.icon ??
    tok.tokenImage ??
    tok.token?.logoURI ??
    tok.token?.image ??
    tok.token?.imageUrl ??
    tok._api?.logoURI ??
    tok._api?.imageUrl ??
    tok._api?.image ??
    null
  );
}

/** Narrative for one mint only — avoids war layout subscribing to the full narratives map. */
const WarNarrativeSnippet = React.memo(function WarNarrativeSnippet({ tok, maxLen }) {
  const mint = tok.mint ?? tok.address;
  const narrativeEntry = useMarketStore((s) => (mint ? s.narratives.get(mint) : undefined));
  const score = Math.round(tok._currentScore ?? tok.sentinelScore ?? 0);
  const full = (() => {
    const line =
      narrativeEntry?.message ??
      tok.whyNowBulletLines?.[0] ??
      narrativeFromData({ ...tok, _currentScore: score });
    return line != null && line !== "" ? String(line) : "";
  })();
  if (maxLen != null && full.length > maxLen) return `${full.slice(0, maxLen)}…`;
  return full;
});

const OpportunityRow = React.memo(function OpportunityRow({
  tok,
  rank,
  onSelect,
  isActive,
  isNew,
  activeMint
}) {
  const mint = tok.mint ?? tok.address ?? "";
  const narrativeEntry = useMarketStore((s) => (mint ? s.narratives.get(mint) : undefined));
  const score = Math.round(tok._currentScore ?? tok.sentinelScore ?? 0);
  const intent = getIntentLevel(score);
  const act = getAction(score, tok.decision ?? tok.action);
  const narr = (() => {
    const line =
      narrativeEntry?.message ??
      tok.whyNowBulletLines?.[0] ??
      narrativeFromData({ ...tok, _currentScore: score });
    return line != null && line !== "" ? String(line) : "";
  })();
  const chips = getPatternChips(tok);
  const imgUrl = tokenImageUrl(tok);
  const wallets = tok.smartMoneyCount ?? tok.smartWallets ?? 0;
  const change = tok.priceChange24h ?? tok.change24h ?? 0;

  const animateVals = useMemo(
    () => ({
      opacity: isActive ? 1 : activeMint ? 0.55 : 1,
      y: 0,
      scale: isActive ? 1.015 : activeMint ? 0.985 : 1,
      filter: isActive
        ? "brightness(1.08)"
        : activeMint
          ? "brightness(0.8)"
          : "brightness(1)"
    }),
    [isActive, activeMint]
  );

  return (
    <motion.div
      role="button"
      onClick={() => onSelect?.(tok)}
      className={`war-opportunity ${intent.cls} ${
        activeMint ? (isActive ? "war-card-active" : "war-card-inactive") : ""
      }`}
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={animateVals}
      whileHover={
        !isActive
          ? {
              opacity: 0.85,
              scale: 1.0,
              x: 3,
              filter: "brightness(0.95)"
            }
          : {}
      }
      transition={{
        type: "spring",
        stiffness: 260,
        damping: 24
      }}
      style={{ cursor: "pointer" }}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(tok);
        }
      }}
    >
      <div className="war-opp-rank">{rank}</div>
      <div className="war-opp-body">
        <div className="war-opp-top">
          {imgUrl ? (
            <img
              src={imgUrl}
              alt=""
              className="war-token-img-sm"
              onError={(e) => {
                e.target.style.display = "none";
              }}
            />
          ) : null}
          <span className={`war-intent-badge ${intent.cls}`}>{intent.label}</span>
          <span className="war-opp-symbol">
            ${tok.symbol ?? tok.name ?? mint.slice(0, 6)}
          </span>
          {isNew ? <span className="war-new-badge">NEW</span> : null}
        </div>
        <motion.div
          className="war-opp-narrative"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.08, duration: 0.25 }}
        >
          {narr}
        </motion.div>

        {isActive ? (
          <>
            <div className="war-opp-meta">
              {wallets > 0 && (
                <span className="war-opp-chip">{wallets} smart wallets</span>
              )}
              {change > 0 && (
                <span className="war-opp-chip">+{Math.round(change)}% 24h</span>
              )}
            </div>
            {chips.length > 0 ? (
              <div className="war-pattern-chips">
                {chips.map((c, i) => (
                  <span key={`${c.label}-${i}`} className={`war-pattern-chip ${c.cls}`}>
                    {c.label}
                  </span>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
      <div className="war-opp-score-col">
        <div className={`war-opp-score-ring ${intent.cls}`}>
          <span className="war-opp-score-num">{score}</span>
          <span className="war-opp-score-label">INTENT</span>
        </div>
        <div className={`war-opp-action ${act.cls}`}>
          {act.label}
          {isActive ? <span className="war-opp-action-target"> · {act.target}</span> : null}
        </div>
      </div>
    </motion.div>
  );
});

export function WarRoomLayout({ signals = [], hotTokens = [], kpis = {}, onSelectMint }) {
  const [activeMint, setActiveMint] = useState(null);

  const handleSelectToken = useCallback(
    (tok) => {
      const mint = tok.mint ?? tok.address ?? tok.tokenAddress;
      if (!mint) return;
      setActiveMint(mint);
      onSelectMint?.(mint);
    },
    [onSelectMint]
  );

  const allTokens = [
    ...signals,
    ...hotTokens.filter(
      (h) => !signals.find((s) => (s.mint ?? s.address) === (h.mint ?? h.address))
    )
  ];
  const sorted = useSortedTokens(allTokens);
  const [rotationIndex, setRotationIndex] = useState(0);
  const [newMint, setNewMint] = useState(null);

  useEffect(() => {
    if (sorted.length < 2) return;
    if (activeMint) return;
    const timer = setInterval(() => {
      setRotationIndex((prev) => (prev + 1) % sorted.length);
    }, 10_000);
    return () => clearInterval(timer);
  }, [sorted.length, activeMint]);

  const visible = useMemo(() => {
    const base =
      sorted.length >= 2
        ? [...sorted.slice(rotationIndex), ...sorted.slice(0, rotationIndex)].slice(0, 4)
        : sorted.slice(0, 4);
    return base.filter((tok) => tok.mint ?? tok.address);
  }, [rotationIndex, sorted.length]);

  const topSlotMint = visible[0]?.mint ?? visible[0]?.address ?? null;

  useEffect(() => {
    if (!topSlotMint) {
      setNewMint(null);
      return;
    }
    setNewMint(topSlotMint);
    const t = setTimeout(() => setNewMint(null), 2500);
    return () => clearTimeout(t);
  }, [rotationIndex, topSlotMint]);

  const activeTok =
    visible.find((t) => (t.mint ?? t.address) === activeMint) ?? visible[0] ?? null;

  const focusScore = activeTok
    ? Math.round(activeTok._currentScore ?? activeTok.sentinelScore ?? 0)
    : null;

  return (
    <div className="war-room-container">
      <div className="war-room-header">
        <div className="war-room-title-row">
          <span className="war-room-icon">⊕</span>
          <h1 className="war-room-title">WAR ROOM</h1>
        </div>
        <p className="war-room-subtitle">
          Real-time smart money intelligence. Act before it moves.
        </p>
      </div>

      <div className="war-room-kpis">
        <div className="war-kpi">
          <span className="war-kpi-label">HIGH INTENT SIGNALS</span>
          <span className="war-kpi-value war-kpi-red">
            {kpis.highIntentCount ??
              signals.filter((s) => (s._currentScore ?? s.sentinelScore ?? 0) >= 75).length}
          </span>
          <span className="war-kpi-delta">↑ active now</span>
        </div>
        <div className="war-kpi">
          <span className="war-kpi-label">SMART WALLETS ACTIVE</span>
          <span className="war-kpi-value war-kpi-green">{kpis.activeWallets ?? "--"}</span>
          <span className="war-kpi-delta">monitoring</span>
        </div>
        <div className="war-kpi">
          <span className="war-kpi-label">BEST SIGNAL</span>
          <span className="war-kpi-value war-kpi-white">
            {kpis.bestScore ?? focusScore ?? "--"}
          </span>
          <span className="war-kpi-delta">confidence</span>
        </div>
        <div className="war-kpi war-kpi-danger">
          <span className="war-kpi-label">MARKET TEMPERATURE</span>
          <span className="war-kpi-value war-kpi-red">{kpis.marketTemp ?? "ACTIVE"}</span>
        </div>
      </div>

      <div className="war-room-body">
        <div className="war-room-main">
          <div className="war-room-section-header">
            <span className="war-room-section-title">⊛ TOP OPPORTUNITIES</span>
            <span className="war-room-section-sub">Sorted by Smart Money Intent</span>
          </div>

          <div className="war-opportunities-list">
            {visible.map((tok, i) => {
              const mint = tok.mint ?? tok.address;
              return (
                <OpportunityRow
                  key={mint}
                  tok={tok}
                  rank={i + 1}
                  onSelect={handleSelectToken}
                  isActive={Boolean(mint && activeMint === mint)}
                  isNew={Boolean(mint && newMint === mint)}
                  activeMint={activeMint}
                />
              );
            })}
          </div>
        </div>

        <div className="war-room-aside">
          <div className="war-aside-section">
            <div className="war-aside-title">
              ⬤ RECENT SIGNALS <span style={{ color: "#22c55e", marginLeft: 4 }}>Live</span>
            </div>
            {visible.map((tok) => {
              const sc = Math.round(tok._currentScore ?? tok.sentinelScore ?? 0);
              const intent = getIntentLevel(sc);
              const mint = tok.mint ?? tok.address;
              const isRecentActive = Boolean(mint && activeMint === mint);
              return (
                <div
                  key={mint}
                  className={`war-recent-signal${isRecentActive ? " war-recent-active" : ""}`}
                  onClick={() => handleSelectToken(tok)}
                  style={{ cursor: "pointer" }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleSelectToken(tok);
                    }
                  }}
                >
                  <span className={`war-intent-dot ${intent.cls}`} />
                  <span className="war-recent-symbol">
                    ${tok.symbol ?? tok.name ?? "TOKEN"}
                  </span>
                  <span className="war-recent-narrative">
                    <WarNarrativeSnippet tok={tok} maxLen={32} />
                  </span>
                  <span className="war-recent-score">{sc}</span>
                </div>
              );
            })}
          </div>
          <div className="war-aside-section">
            <div className="war-aside-title">QUICK ACTIONS</div>
            <a href="/alerts" className="war-quick-action">
              ⚑ VIEW ALL ALERTS
            </a>
            <a href="/wallet-stalker" className="war-quick-action">
              ◎ TRACK WALLET
            </a>
            <a href="/watchlist" className="war-quick-action">
              ★ MANAGE WATCHLIST
            </a>
          </div>
          <SmartMoneyFlow tok={activeTok} />
        </div>
      </div>

      <div className="war-narrative-bar">
        <div className="war-narrative-bar-left">
          <span className="war-narrative-engine-label">⊕ SENTINEL NARRATIVE ENGINE</span>
          <span className="war-narrative-engine-sub">Generating insights...</span>
        </div>
        <div className="war-narrative-bar-center">
          {activeTok ? (
            <span className="war-narrative-bar-text">
              &quot;<WarNarrativeSnippet tok={activeTok} />&quot;
            </span>
          ) : null}
        </div>
        <div className="war-narrative-bar-right">
          <span className="war-conviction-badge">
            HIGH CONVICTION · {focusScore ?? "--"}% Confidence
          </span>
        </div>
      </div>
    </div>
  );
}
