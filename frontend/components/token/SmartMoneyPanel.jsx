import { useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useSmartMoney } from "../../hooks/useSmartMoney";
import { useClientAuthToken } from "../../hooks/useClientAuthToken";
import { useWalletLabels } from "../../hooks/useWalletLabels";
import { useAccessTier } from "../../hooks/useAccessTier";
import { useSubscriptionModal } from "../../contexts/SubscriptionModalContext";
import { Activity, Copy, KeyRound, Lock, Radio, Shield, Trophy, Wallet, Zap } from "lucide-react";
import toast from "react-hot-toast";
import { formatDateTime, formatUsdAmount } from "../../lib/formatStable";
import { TerminalActionIcons } from "../terminal/TerminalActionIcons";
import { buildSolscanAccountUrl, EXTERNAL_ANCHOR_REL } from "../../lib/terminalLinks";

/**
 * Three possible reasons:
 *   - "upgrade"   user is not PRO -> open SubscriptionModal (pay)
 *   - "sign"      user IS PRO via wallet sub but never signed in (no JWT)
 *                 -> ask them to (re)connect wallet so WalletButton triggers the
 *                    SIWS message; backend needs JWT to gate the endpoint
 *   - "connect"   no wallet connected at all -> open wallet picker
 */
function SmartMoneyLockedPreview({ reason = "upgrade" }) {
  const { openSubscriptionModal } = useSubscriptionModal();
  const { setVisible } = useWalletModal();
  const { disconnect } = useWallet();

  const headline =
    reason === "sign"
      ? "PRO active — sign once to unlock"
      : reason === "connect"
        ? "Connect your wallet to unlock smart wallets"
        : "Smart wallets on this mint are PRO";

  const sub =
    reason === "sign"
      ? "Your wallet has an active Sentinel PRO plan. Re-sign with your wallet so the server can verify your session — it takes one click."
      : reason === "connect"
        ? "Plug in your Solana wallet. If you're PRO, you'll see the wallet-level data instantly."
        : "See the exact wallets accumulating this token, their tier, Birdeye PnL and entry timing.";

  const ctaLabel =
    reason === "sign" ? "Re-sign with wallet" : reason === "connect" ? "Connect wallet" : "Unlock smart wallets";

  const handleClick = async () => {
    if (reason === "sign") {
      // The WalletButton auto-sign effect bails when localStorage still holds an
      // old/stale token, so we must clear it first; then disconnect + reopen the
      // picker so the effect fires on the next `connected` flip.
      try {
        localStorage.removeItem("token");
      } catch (_) {}
      try {
        await disconnect();
      } catch (_) {}
      setVisible(true);
      toast("Pick your wallet, then approve the signature.");
      return;
    }
    if (reason === "connect") {
      setVisible(true);
      return;
    }
    openSubscriptionModal();
  };
  return (
    <div
      className="sl-card-premium sl-shine-edge relative overflow-hidden p-5"
      style={{
        borderColor: "rgba(96,165,250,0.40)",
        boxShadow:
          "0 0 0 1px rgba(96,165,250,0.18) inset, 0 14px 36px -12px rgba(37,99,235,0.55), 0 0 28px -6px rgba(37,99,235,0.25)"
      }}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[rgba(96,165,250,0.5)] bg-[rgba(37,99,235,0.15)] text-[var(--sl-diamond)] shadow-[0_0_18px_rgba(37,99,235,0.4)]">
          {reason === "sign" ? <KeyRound size={18} strokeWidth={2.2} /> : <Lock size={18} strokeWidth={2.2} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="sl-eyebrow flex items-center gap-2 text-[var(--sl-sapphire-hi)]">
            <span className="sl-live-dot" />
            {reason === "sign" ? "Session needed" : "Sentinel PRO"}
          </div>
          <h3 className="sl-display mt-1 text-lg font-bold text-[var(--sl-text-primary)]">{headline}</h3>
          <p className="mt-1.5 max-w-md text-[12.5px] leading-relaxed text-[var(--sl-text-secondary)]">{sub}</p>
        </div>
      </div>

      {reason !== "sign" ? (
        <ul className="mt-4 grid gap-2 text-[12px] text-[var(--sl-text-secondary)] sm:grid-cols-2">
          <li className="flex items-center gap-2">
            <span className="sl-live-dot sl-live-dot--win" />
            Ranked wallet list per token
          </li>
          <li className="flex items-center gap-2">
            <span className="sl-live-dot sl-live-dot--win" />
            Birdeye PnL + entry timing
          </li>
          <li className="flex items-center gap-2">
            <span className="sl-live-dot sl-live-dot--win" />
            Realtime signals (no 30m delay)
          </li>
          <li className="flex items-center gap-2">
            <span className="sl-live-dot sl-live-dot--win" />
            Telegram + push alerts
          </li>
        </ul>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleClick}
          className="sl-shine-edge inline-flex h-10 items-center gap-2 rounded-lg border border-[rgba(147,197,253,0.85)] bg-gradient-to-br from-[rgba(37,99,235,0.32)] to-[rgba(29,78,216,0.18)] px-4 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--sl-diamond-bright)] shadow-[0_0_0_1px_rgba(147,197,253,0.4)_inset,0_12px_30px_-10px_rgba(37,99,235,0.85)] transition-all hover:from-[rgba(37,99,235,0.45)] hover:to-[rgba(29,78,216,0.28)] hover:shadow-[0_0_0_1px_rgba(191,219,254,0.55)_inset,0_18px_38px_-10px_rgba(37,99,235,1)]"
        >
          <span className="sl-live-dot" style={{ width: "5px", height: "5px" }} />
          {ctaLabel}
        </button>
        {reason === "upgrade" ? (
          <span className="sl-num text-[11px] text-[var(--sl-text-muted)]">10 USDC · 7d · 29 USDC · 30d</span>
        ) : reason === "sign" ? (
          <span className="sl-num text-[11px] text-[var(--sl-text-muted)]">No payment · signature only</span>
        ) : null}
      </div>

      {/* Decorative blurred preview rows */}
      <div className="mt-5 grid gap-2 opacity-60 [filter:blur(2.5px)] pointer-events-none select-none" aria-hidden>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-surface)] px-3 py-2.5"
          >
            <div className="flex items-center gap-2.5">
              <span className="h-7 w-7 rounded-full bg-gradient-to-br from-[rgba(37,99,235,0.4)] to-[rgba(96,165,250,0.2)]" />
              <span className="sl-num text-[11px] text-[var(--sl-text-secondary)]">▮▮▮▮…▮▮▮▮</span>
            </div>
            <span className="sl-num text-[12px] font-bold text-[var(--sl-diamond)]">▮▮.▮%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function compactWallet(wallet) {
  if (!wallet) return "unknown";
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

function tierBadgeClass(tier) {
  if (tier === 1) return "bg-gradient-to-r from-blue-500/25 to-orange-500/20 text-blue-200 border-blue-500/35";
  if (tier === 2) return "bg-cyan-500/15 text-cyan-200 border-cyan-500/30";
  return "bg-white/[0.06] text-gray-300 border-white/10";
}

function metricValue(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function SmartMoneyPanel({ tokenAddress, flaggedWallets }) {
  const token = useClientAuthToken();
  const { connected } = useWallet();
  const { isPro, isLoading: tierLoading } = useAccessTier();
  const hasToken = Boolean(token);
  const enabled = hasToken && isPro;
  const { data: payload, isLoading, error } = useSmartMoney(tokenAddress, enabled ? token : null);
  const wallets = payload?.data || [];
  const walletAddresses = useMemo(() => wallets.map((w) => w.wallet).filter(Boolean), [wallets]);
  const { labelFor, titleFor } = useWalletLabels(walletAddresses);
  const meta = payload?.meta || {};
  const isOnChain = meta.source === "on_chain";
  const hasBirdeye = meta.pnlProvider === "birdeye";
  const birdeyeRestExhausted = meta.birdeyeRestStatus === "exhausted";
  const strengthLabel = hasBirdeye ? "Score" : isOnChain ? "Signal" : "WR";

  if (!tokenAddress) {
    return <div className="text-gray-500 text-sm text-center py-6">Token address missing</div>;
  }

  // Don't render any locked / free state until the tier resolves, or we'd flash
  // the upgrade preview to a PRO user on every token click before walletSub
  // returns from /api/v1/subscription/status.
  if (tierLoading) {
    return (
      <div className="sl-card-premium px-4 py-10 text-center space-y-2">
        <div className="inline-flex h-7 w-7 border-2 border-[rgba(96,165,250,0.5)] border-t-transparent rounded-full animate-spin mx-auto shadow-[0_0_14px_rgba(37,99,235,0.4)]" />
        <p className="sl-num text-[11.5px] text-[var(--sl-text-muted)]">Verifying access…</p>
      </div>
    );
  }

  // Three honest states for a non-loaded panel:
  //  (a) not PRO at all  -> upgrade modal
  //  (b) PRO but no JWT  -> wallet re-sign (no payment)
  //  (c) wallet not even connected -> wallet picker
  if (!isPro) {
    return <SmartMoneyLockedPreview reason={connected ? "upgrade" : "connect"} />;
  }
  if (!hasToken) {
    return <SmartMoneyLockedPreview reason="sign" />;
  }

  if (isLoading) {
    return (
      <div className="sl-card-premium px-4 py-10 text-center space-y-2">
        <div className="inline-flex h-8 w-8 border-2 border-[rgba(96,165,250,0.5)] border-t-transparent rounded-full animate-spin mx-auto shadow-[0_0_18px_rgba(37,99,235,0.4)]" />
        <p className="sl-num text-[12px] text-[var(--sl-text-secondary)]">Ranking wallets for this mint…</p>
      </div>
    );
  }

  if (error) {
    // 403 here means the JWT doesn't show PRO server-side even though the
    // wallet sub does. Re-signing typically refreshes it.
    const isProGate = /upgrade to pro/i.test(error.message || "");
    if (isProGate) {
      return <SmartMoneyLockedPreview reason="sign" />;
    }
    return (
      <div className="rounded-lg border border-rose-500/35 bg-rose-500/10 px-4 py-4 text-center text-[12.5px] text-rose-200">
        {error.message || "Failed to load smart money data"}
      </div>
    );
  }

  if (!wallets.length) {
    return (
      <div className="text-gray-500 text-sm text-center py-8 border border-dashed border-gray-700 space-y-3 px-4">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-white/[0.04] border border-white/[0.08] mx-auto">
          <Radio size={22} className="text-purple-400" />
        </div>
        <p className="text-gray-300 font-medium">No wallet snapshot yet</p>
        {meta.source === "on_chain_empty" ? (
          <p className="text-[12px] text-gray-600 max-w-sm mx-auto leading-relaxed">
            Needs recent DEX / transfer activity. Confirm Helius + RPC on the API, then retry after volume picks up.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Competitive summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Wallets</p>
          <p className="text-lg font-bold text-white mt-0.5">{wallets.length}</p>
        </div>
        <div className="rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Elite</p>
          <p className="text-lg font-bold text-blue-200 mt-0.5">{meta.eliteCount ?? "—"}</p>
        </div>
        <div className="rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Helius txs</p>
          <p className="text-lg font-bold text-white mt-0.5">{meta.heliusTxSample ?? "—"}</p>
        </div>
        <div className="rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">PnL data</p>
          <p className="text-sm font-semibold mt-1 inline-flex items-center gap-1">
            <Zap size={14} className={birdeyeRestExhausted ? "text-amber-300/90" : hasBirdeye ? "text-emerald-300" : "text-gray-400"} />
            {birdeyeRestExhausted ? "Cuota agotada" : hasBirdeye ? "Birdeye live" : "On-chain only"}
          </p>
        </div>
      </div>

      {birdeyeRestExhausted ? (
        <p className="text-[11px] text-amber-300/90 leading-relaxed border border-amber-500/25 bg-amber-500/10 px-3 py-2 rounded-md">
          PnL no disponible: cuota Birdeye REST agotada. Mostrando señal on-chain solamente.
        </p>
      ) : null}
      {meta.tierLegend ? (
        <p className="text-[11px] text-gray-500 leading-relaxed border-l-2 border-purple-500/40 pl-3">{meta.tierLegend}</p>
      ) : null}
      {meta.metricLabel ? (
        <p className="text-[11px] text-gray-500 leading-relaxed">{meta.metricLabel}</p>
      ) : null}
      <p className="text-[11px] text-gray-500 leading-relaxed border-l-2 border-cyan-500/35 pl-3">
        Actor intelligence uses traceable wallet stats when available: consistency, early entry, double-down proxy, and cluster overlap.
      </p>

      <div className="grid grid-cols-1 gap-4">
        {wallets.map((wallet, index) => {
          const tier = wallet.tier ?? 3;
          const tierLabel = wallet.tierLabel || "Scout";
          const flagged = flaggedWallets?.has?.(wallet.wallet);
          const early = metricValue(wallet.earlyEntry);
          const cluster = metricValue(wallet.cluster);
          const consistency = metricValue(wallet.consistency);
          const doubleDownProxy = Math.min(100, Math.round(Number(wallet.recentHits || 0) * 12));
          return (
            <div
              key={wallet.wallet}
              className={`rounded-[14px] p-4 border flex flex-col sm:flex-row sm:items-stretch sm:justify-between gap-4 transition ${
                flagged
                  ? "bg-red-950/25 border-red-500/40"
                  : "bg-[#0E1318] border-[#2a2f36] hover:border-purple-500/25"
              }`}
            >
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-md border ${tierBadgeClass(tier)}`}
                  >
                    {tierLabel}
                  </span>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500/30 to-cyan-600/15 border border-purple-500/25 flex items-center justify-center text-purple-100">
                    <Wallet size={18} />
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-sm text-gray-100 font-medium truncate" title={titleFor(wallet.wallet)}>
                    {labelFor(wallet.wallet)}
                  </div>
                  <div className="font-mono text-[11px] text-gray-500 mt-0.5">{compactWallet(wallet.wallet)}</div>
                  <div className="text-[12px] text-gray-500 mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="inline-flex items-center gap-1">
                      <Activity size={12} />
                      {wallet.lastAction}
                    </span>
                    {wallet.lastSeen ? (
                      <span>· {formatDateTime(wallet.lastSeen)}</span>
                    ) : null}
                  </div>
                  {flagged ? (
                    <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-red-300">
                      <Shield size={12} />
                      Flagged by wallet intel
                    </div>
                  ) : null}
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {[
                      ["Early", early],
                      ["Consistency", consistency],
                      ["Double-down", Number.isFinite(doubleDownProxy) ? doubleDownProxy : null],
                      ["Cluster", cluster]
                    ].map(([label, value]) => (
                      <div key={label} className="border border-white/[0.07] bg-white/[0.025] px-2 py-1.5">
                        <p className="text-[8px] uppercase tracking-[0.12em] text-gray-500">{label}</p>
                        <p className="mt-0.5 font-mono text-[12px] text-gray-200">{value != null ? value : "—"}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <TerminalActionIcons mint={tokenAddress} className="justify-start" />
                    <a
                      href={buildSolscanAccountUrl(wallet.wallet)}
                      target="_blank"
                      rel={EXTERNAL_ANCHOR_REL}
                      className="inline-flex h-7 items-center rounded-md border border-white/10 bg-white/[0.04] px-2 text-[11px] font-semibold text-gray-200 hover:text-white"
                    >
                      Solscan
                    </a>
                  </div>
                </div>
              </div>

              <div className="flex sm:flex-col items-end justify-between sm:justify-start gap-3 sm:min-w-[148px] border-t sm:border-t-0 sm:border-l border-white/[0.06] pt-3 sm:pt-0 sm:pl-4">
                {index < 3 && (
                  <div className="text-[10px] uppercase tracking-wide text-blue-300 inline-flex items-center gap-1 sm:order-first">
                    <Trophy size={12} /> Top 3
                  </div>
                )}
                <div className="text-right flex-1 sm:flex-none">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{strengthLabel}</p>
                  <p className="text-lg font-bold text-emerald-300 tabular-nums">
                    {Number(wallet.winRate || 0).toFixed(1)}
                    <span className="text-sm text-gray-500">%</span>
                  </p>
                  <div className="w-full max-w-[140px] sm:ml-auto h-1.5 bg-gray-800 rounded-full mt-1.5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#6c5ce7] to-[#00cec9]"
                      style={{ width: `${Math.min(Math.max(Number(wallet.winRate || 0), 0), 100)}%` }}
                    />
                  </div>
                  {wallet.pnlSource === "birdeye" ? (
                    <div className="mt-2 text-xs text-gray-300">
                      Realized ${formatUsdAmount(wallet.realizedPnl)}
                      {wallet.pnlPercentRealized != null ? (
                        <span className="text-gray-500 text-[11px]">
                          {" "}
                          ({wallet.pnlPercentRealized > 0 ? "+" : ""}
                          {Number(wallet.pnlPercentRealized).toFixed(1)}%)
                        </span>
                      ) : null}
                    </div>
                  ) : isOnChain && hasBirdeye ? (
                    <div className="mt-2 text-[11px] text-gray-500">No Birdeye PnL row for this wallet</div>
                  ) : isOnChain ? (
                    <div className="mt-2 text-[11px] text-gray-500">PnL via Birdeye when available</div>
                  ) : (
                    <div className="mt-2 text-xs text-gray-400">PnL ${formatUsdAmount(wallet.realizedPnl)}</div>
                  )}
                  <div className="text-[11px] text-gray-500 mt-1">
                    Hits {Number(wallet.recentHits || 0)} · Avg ${formatUsdAmount(wallet.avgPositionSize)}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(wallet.wallet);
                        toast.success("Wallet copied.");
                      } catch (_) {
                        toast.error("Copy failed.");
                      }
                    }}
                    className="mt-2 text-[11px] text-cyan-300 hover:text-cyan-200 inline-flex items-center gap-1 font-medium"
                  >
                    <Copy size={11} />
                    Copy address
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
