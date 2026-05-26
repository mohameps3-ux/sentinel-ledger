import Link from "next/link";
import { formatCompact } from "../../lib/formatStable";

const RAIL_STYLES = {
  hot: {
    border: "#FF6B35",
    glow: "rgba(255, 107, 53, 0.35)",
    label: "HOT"
  },
  live: {
    border: "#00D4FF",
    glow: "rgba(0, 212, 255, 0.35)",
    label: "LIVE"
  },
  velocity: {
    border: "#A3E635",
    glow: "rgba(163, 230, 53, 0.35)",
    label: "VEL"
  }
};

function truncateMint(addr) {
  const s = String(addr || "");
  if (s.length <= 14) return s;
  return `${s.slice(0, 6)}...${s.slice(-4)}`;
}

function MainMetric({ item }) {
  const rail = item.rail;
  if (rail === "hot") {
    const smart = Number(item.smart_wallets_active_4h) || 0;
    const vol = Number(item.volume_60m_usd) || Number(item.volume_15m_usd) || 0;
    return (
      <div className="mt-2">
        <p className="font-mono text-2xl font-semibold tabular-nums text-sl-text">{smart}</p>
        <p className="text-[10px] uppercase tracking-[0.12em] text-sl-muted">smart wallets · {formatCompact(vol)} vol</p>
      </div>
    );
  }
  if (rail === "live") {
    const conf = Math.round(Number(item.max_confidence_60m ?? item.rail_score) || 0);
    const pct = Math.max(0, Math.min(100, conf));
    return (
      <div className="mt-2">
        <p className="font-mono text-2xl font-semibold tabular-nums text-cyan-300">{conf}</p>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-sky-400 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-sl-muted">confidence · 60m</p>
      </div>
    );
  }
  const chg = Number(item.price_change_15m_pct);
  const label = Number.isFinite(chg) ? `${chg >= 0 ? "+" : ""}${chg.toFixed(1)}%` : "—";
  return (
    <div className="mt-2">
      <p className={`font-mono text-2xl font-semibold tabular-nums ${Number.isFinite(chg) && chg >= 0 ? "text-lime-300" : "text-rose-400"}`}>
        {label}
      </p>
      <p className="text-[10px] uppercase tracking-[0.12em] text-sl-muted">15m move</p>
    </div>
  );
}

export function RailCard({ item, pulsing = false }) {
  const rail = item.rail || "hot";
  const style = RAIL_STYLES[rail] || RAIL_STYLES.hot;
  const mint = item.token_address;
  const borderColor = item.multi_rail ? "#F59E0B" : style.border;
  const borderWidth = item.multi_rail ? 2 : 1;
  const signals = Array.isArray(item.signals_active) ? item.signals_active : [];

  return (
    <Link
      href={mint ? `/token/${encodeURIComponent(mint)}` : "#"}
      className={`group relative flex shrink-0 snap-start flex-col rounded-lg border bg-sl-card/90 p-3 no-underline transition-all duration-200 hover:-translate-y-0.5 ${
        pulsing ? "animate-pulse ring-2 ring-cyan-400/60" : ""
      }`}
      style={{
        width: "min(88vw, 240px)",
        borderColor,
        borderWidth: `${borderWidth}px`,
        boxShadow: `0 0 0 0 ${style.glow}`
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = `0 8px 28px ${style.glow}`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = `0 0 0 0 ${style.glow}`;
      }}
    >
      {item.multi_rail ? (
        <span className="absolute right-2 top-2 rounded border border-amber-400/50 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-mono font-semibold uppercase tracking-wider text-amber-200">
          MULTI
        </span>
      ) : null}
      <div className="pr-10">
        <p className="truncate font-mono text-base font-semibold text-sl-text">${String(item.token_symbol || "?").replace(/^\$/, "")}</p>
        <p className="mt-0.5 truncate font-mono text-[10px] text-sl-muted">{truncateMint(mint)}</p>
      </div>
      <MainMetric item={item} />
      <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-sl-sub">{item.rail_reason}</p>
      {signals.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {signals.slice(0, 4).map((sig) => (
            <span
              key={sig}
              className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-sl-muted"
            >
              {sig}
            </span>
          ))}
        </div>
      ) : null}
    </Link>
  );
}
