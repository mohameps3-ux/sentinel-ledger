import { useMarketStore } from "@/lib/store/marketStore";
import { useSortedTokens } from "@/hooks/useSortedTokens";
import { narrativeFromData } from "@/lib/narrativeFromData";

export function WarRoomLayout({ signals = [], hotTokens = [], kpis = {} }) {
  const narratives = useMarketStore((s) => s.narratives);

  const allTokens = [
    ...signals,
    ...hotTokens.filter(
      (h) => !signals.find((s) => (s.mint ?? s.address) === (h.mint ?? h.address))
    )
  ];
  const sorted = useSortedTokens(allTokens).slice(0, 4);
  const hero = sorted[0];
  const rest = sorted.slice(1);

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

  function OpportunityHero({ tok }) {
    if (!tok) return null;
    const score = Math.round(tok._currentScore ?? tok.sentinelScore ?? 0);
    const intent = getIntentLevel(score);
    const act = getAction(score, tok.decision ?? tok.action);
    const narr = getNarrative(tok);
    const wallets = tok.smartMoneyCount ?? tok.smartWallets ?? 0;
    const change = tok.priceChange24h ?? tok.change24h ?? 0;

    return (
      <div className={`war-hero ${intent.cls}`}>
        <div className="war-hero-left">
          <div className="war-hero-top">
            <span className={`war-intent-badge ${intent.cls}`}>{intent.label}</span>
            <span className="war-hero-symbol">
              ${tok.symbol ?? tok.name ?? (tok.mint ?? "").slice(0, 6)}
            </span>
          </div>
          <div className="war-hero-narrative">{narr}</div>
          <div className="war-hero-chips">
            {wallets > 0 && <span className="war-opp-chip">{wallets} smart wallets</span>}
            {change > 0 && <span className="war-opp-chip">+{Math.round(change)}% 24h</span>}
            <span className="war-opp-chip">
              {tok._liveSource === "hot_fill" ? "HEAT" : "SIGNAL"}
            </span>
          </div>
        </div>
        <div className="war-hero-right">
          <div className={`war-hero-score-ring ${intent.cls}`}>
            <span className="war-hero-score-num">{score}</span>
            <span className="war-opp-score-label">INTENT</span>
          </div>
          <div className={`war-hero-action ${act.cls}`}>
            <span className="war-hero-action-label">{act.label}</span>
            <span className="war-hero-action-meta">Target: {act.target}</span>
            <span className="war-hero-action-meta">Time: {act.time}</span>
          </div>
        </div>
      </div>
    );
  }

  function OpportunityRow({ tok, rank }) {
    const score = Math.round(tok._currentScore ?? tok.sentinelScore ?? 0);
    const intent = getIntentLevel(score);
    const act = getAction(score, tok.decision ?? tok.action);
    const narr = getNarrative(tok);

    return (
      <div className={`war-opportunity ${intent.cls}`}>
        <div className="war-opp-rank">{rank}</div>
        <div className="war-opp-body">
          <div className="war-opp-top">
            <span className={`war-intent-badge ${intent.cls}`}>{intent.label}</span>
            <span className="war-opp-symbol">
              ${tok.symbol ?? tok.name ?? (tok.mint ?? "").slice(0, 6)}
            </span>
          </div>
          <div className="war-opp-narrative">{narr}</div>
        </div>
        <div className="war-opp-score-col">
          <div className={`war-opp-score-ring ${intent.cls}`}>
            <span className="war-opp-score-num">{score}</span>
            <span className="war-opp-score-label">INTENT</span>
          </div>
          <div className={`war-opp-action ${act.cls}`}>
            {act.label}
            <span className="war-opp-action-target"> · {act.target}</span>
          </div>
        </div>
      </div>
    );
  }

  const heroNarr = hero
    ? narrativeFromData({
        ...hero,
        _currentScore: hero._currentScore ?? hero.sentinelScore ?? 0
      })
    : null;
  const heroScore = hero ? Math.round(hero._currentScore ?? hero.sentinelScore ?? 0) : null;

  function recentNarrativePreview(tok) {
    const full = getNarrative(tok);
    if (full.length <= 32) return full;
    return `${full.slice(0, 32)}…`;
  }

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
          <span className="war-kpi-value war-kpi-white">{kpis.bestScore ?? heroScore ?? "--"}</span>
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

          <OpportunityHero tok={hero} />

          <div className="war-opportunities-list">
            {rest.map((tok, i) => (
              <OpportunityRow
                key={tok.mint ?? tok.address ?? i}
                tok={tok}
                rank={i + 2}
              />
            ))}
          </div>
        </div>

        <div className="war-room-aside">
          <div className="war-aside-section">
            <div className="war-aside-title">
              ⬤ RECENT SIGNALS <span style={{ color: "#22c55e", marginLeft: 4 }}>Live</span>
            </div>
            {sorted.map((tok, i) => {
              const sc = Math.round(tok._currentScore ?? tok.sentinelScore ?? 0);
              const intent = getIntentLevel(sc);
              return (
                <div key={tok.mint ?? tok.address ?? i} className="war-recent-signal">
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
        </div>
      </div>

      <div className="war-narrative-bar">
        <div className="war-narrative-bar-left">
          <span className="war-narrative-engine-label">⊕ SENTINEL NARRATIVE ENGINE</span>
          <span className="war-narrative-engine-sub">Generating insights...</span>
        </div>
        <div className="war-narrative-bar-center">
          {heroNarr && <span className="war-narrative-bar-text">&quot;{heroNarr}&quot;</span>}
        </div>
        <div className="war-narrative-bar-right">
          <span className="war-conviction-badge">
            HIGH CONVICTION · {heroScore ?? "--"}% Confidence
          </span>
        </div>
      </div>
    </div>
  );
}
