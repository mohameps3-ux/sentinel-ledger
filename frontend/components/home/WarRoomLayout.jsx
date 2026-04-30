import { useState, useEffect } from "react";
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

export function WarRoomLayout({ signals = [], hotTokens = [], kpis = {}, onSelectMint }) {
  const narratives = useMarketStore((s) => s.narratives);
  const [activeMint, setActiveMint] = useState(null);

  const handleSelectToken = (tok) => {
    const mint = tok.mint ?? tok.address ?? tok.tokenAddress;
    if (!mint) return;
    setActiveMint(mint);
    onSelectMint?.(mint);
  };

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
    const timer = setInterval(() => {
      setRotationIndex((prev) => (prev + 1) % sorted.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [sorted.length]);

  const visible =
    sorted.length >= 2
      ? [...sorted.slice(rotationIndex), ...sorted.slice(0, rotationIndex)].slice(0, 4)
      : sorted.slice(0, 4);

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

  function getNarrative(tok) {
    const mint = tok.mint ?? tok.address;
    const score = tok._currentScore ?? tok.sentinelScore ?? 0;
    const line =
      (mint ? narratives.get(mint)?.message : null) ??
      tok.whyNowBulletLines?.[0] ??
      narrativeFromData({ ...tok, _currentScore: score });
    return line != null && line !== "" ? String(line) : "";
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

  function OpportunityRow({ tok, rank, onSelect, isActive, isNew }) {
    const mint = tok.mint ?? tok.address ?? "";
    const score = Math.round(tok._currentScore ?? tok.sentinelScore ?? 0);
    const intent = getIntentLevel(score);
    const act = getAction(score, tok.decision ?? tok.action);
    const narr = getNarrative(tok);
    const chips = getPatternChips(tok);
    const imgUrl = tokenImageUrl(tok);
    const wallets = tok.smartMoneyCount ?? tok.smartWallets ?? 0;
    const change = tok.priceChange24h ?? tok.change24h ?? 0;

    const cardClass =
      activeMint != null
        ? isActive
          ? "war-card-active"
          : "war-card-inactive"
        : "";

    return (
      <div
        className={["war-opportunity", intent.cls, cardClass].filter(Boolean).join(" ")}
        onClick={() => onSelect?.(tok)}
        style={{ cursor: "pointer" }}
        role="button"
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
          <div className="war-opp-narrative">{narr}</div>

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
      </div>
    );
  }

  function recentNarrativePreview(tok) {
    const full = getNarrative(tok);
    if (full.length <= 32) return full;
    return `${full.slice(0, 32)}…`;
  }

  const focusNarr = activeTok ? getNarrative(activeTok) : null;
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
              const m = tok.mint ?? tok.address;
              return (
                <OpportunityRow
                  key={tok.mint ?? tok.address ?? i}
                  tok={tok}
                  rank={i + 1}
                  onSelect={handleSelectToken}
                  isActive={Boolean(m && activeMint === m)}
                  isNew={Boolean(m && newMint === m)}
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
            {visible.map((tok, i) => {
              const sc = Math.round(tok._currentScore ?? tok.sentinelScore ?? 0);
              const intent = getIntentLevel(sc);
              const m = tok.mint ?? tok.address;
              const isRecentActive = Boolean(m && activeMint === m);
              return (
                <div
                  key={tok.mint ?? tok.address ?? i}
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
                  <span className="war-recent-narrative">{recentNarrativePreview(tok)}</span>
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
          {focusNarr && <span className="war-narrative-bar-text">&quot;{focusNarr}&quot;</span>}
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
