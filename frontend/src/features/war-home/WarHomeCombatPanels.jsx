import { Fragment, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatUsdWhole } from "../../../lib/formatStable";
import { actionTone, confidenceDot, confidenceLabel, suggestedAction } from "@/lib/signalUtils";
import { redFlagsForSignal } from "@/lib/redFlags";

export default function WarHomeCombatPanels({
  bestRecentDisplay,
  outcomesSummary,
  rankedWallets,
  /** True when rows come from GET /api/v1/smart-wallets/top; false = homeData demo fallback. */
  topWalletsFromApi = false,
  topWalletTitle,
  topWalletLabel,
  strategyMode,
  isLoggedIn,
  liveSignal,
  marketMood,
  alerts
}) {
  const [openTopWallet, setOpenTopWallet] = useState(null);

  function isInteractiveEventTarget(t) {
    if (!t) return false;
    const el = t.nodeType === 1 ? t : t.parentElement;
    if (!el || typeof el.closest !== "function") return false;
    return Boolean(el.closest("a, button, [data-no-row-expand]"));
  }

  function toggleTopWalletRow(key) {
    setOpenTopWallet((k) => (k === key ? null : key));
  }

  const riskLines = liveSignal ? redFlagsForSignal(liveSignal) : [];

  return (
    <>
      <section className="sl-section grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="glass-card sl-inset border border-orange-500/20">
          <p className="text-[11px] text-orange-200/80 font-medium">Último resultado resaltado</p>
          <h2 className="text-base sm:text-lg font-semibold text-white mt-1">
            {bestRecentDisplay.headline}{" "}
            <span className="text-emerald-300">
              {Number(bestRecentDisplay.outcomePct) >= 0 ? "+" : ""}
              {bestRecentDisplay.outcomePct}%
            </span>{" "}
            <span className="text-gray-500 text-sm">({bestRecentDisplay.horizon})</span>
          </h2>
          <p className="text-sm text-gray-400 mt-2">
            Puntuación ~{bestRecentDisplay.signal} ·{" "}
            <Link href={`/token/${bestRecentDisplay.mint}`} className="text-cyan-300/90 hover:underline">
              Abrir ficha
            </Link>
          </p>
        </div>
        <div className="glass-card sl-inset">
          <p className="text-[11px] text-gray-500 font-medium">Últimos 7 días (señales cerradas)</p>
          <h2 className="text-base font-semibold text-white mt-1">Resumen de aciertos</h2>
          <ul className="mt-2 text-sm text-gray-300 space-y-1">
            {outcomesSummary && outcomesSummary.resolved != null ? (
              <>
                <li>
                  Aciertos {outcomesSummary.wins} · No aciertos {outcomesSummary.losses}
                  {outcomesSummary.pending != null ? ` · En curso ${outcomesSummary.pending}` : ""}
                </li>
                <li>
                  Medias: {outcomesSummary.avgWinPct != null ? `+${outcomesSummary.avgWinPct}%` : "—"} ganador /{" "}
                  {outcomesSummary.avgLossPct != null ? `${outcomesSummary.avgLossPct}%` : "—"} perdedor
                </li>
                <li>Retorno neto: {outcomesSummary.netReturnPct != null
                  ? `${outcomesSummary.netReturnPct >= 0 ? "+" : ""}${outcomesSummary.netReturnPct}%`
                  : "—"}</li>
              </>
            ) : (
              <li className="text-gray-500 text-sm">Cargando datos o sin historial aún. Los números reales dependen de tu API.</li>
            )}
          </ul>
        </div>
      </section>

      <section className="sl-section">
        <div className="glass-card sl-inset">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg sm:text-xl font-semibold text-white">Carteras con mejor puntuación</h2>
              <p className="text-xs text-gray-500 mt-1">
                {rankedWallets.length} filas · toca la fila para detalles ·{" "}
                <Link className="text-cyan-400/90 hover:underline" href="/smart-money?limit=50">
                  Ver ranking completo
                </Link>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className={
                  topWalletsFromApi
                    ? "px-2 py-0.5 rounded border border-emerald-500/30 text-emerald-200/90"
                    : "px-2 py-0.5 rounded border border-amber-500/25 text-amber-200/80"
                }
                title={topWalletsFromApi ? "Datos de servidor" : "Ejemplo hasta que haya API"}
              >
                {topWalletsFromApi ? "Datos en vivo" : "Vista de ejemplo"}
              </span>
            </div>
          </div>
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-white/10 text-[10px] uppercase tracking-wide">
                  <th className="py-2 pr-1 w-8" />
                  <th className="py-2 pr-3">Cartera</th>
                  <th className="py-2 pr-3">Win</th>
                  <th className="py-2 pr-3">Entrada</th>
                  <th className="py-2 pr-3">Agrup.</th>
                  <th className="py-2 pr-3">Const.</th>
                  <th className="py-2 pr-3">Puntuac.</th>
                  <th className="py-2 pr-3">Confianza</th>
                  <th className="py-2 pr-3">Idea</th>
                  <th className="py-2">30d $</th>
                </tr>
              </thead>
              <tbody>
                {rankedWallets.map((wallet, wIdx) => {
                  const rowKey = String(wallet.address || wallet.wallet || `idx-${wIdx}`);
                  return (
                    <Fragment key={rowKey}>
                      <tr
                        className="border-b border-white/5 group cursor-pointer hover:bg-white/[0.03]"
                        role="button"
                        tabIndex={0}
                        aria-expanded={openTopWallet === rowKey}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            if (!isInteractiveEventTarget(e.target)) toggleTopWalletRow(rowKey);
                          }
                        }}
                        onClick={(e) => {
                          if (isInteractiveEventTarget(e.target)) return;
                          toggleTopWalletRow(rowKey);
                        }}
                      >
                        <td className="py-3 pr-1 w-8 align-top text-gray-500">
                          <span className="inline-block transition-transform" style={{ transform: openTopWallet === rowKey ? "rotate(90deg)" : "none" }}>
                            <ChevronRight size={16} aria-hidden />
                          </span>
                        </td>
                    <td className="py-3 pr-3">
                      <div className="relative inline-flex items-center gap-2">
                        <span className="text-lg" title="Wallet tier">
                          {wIdx % 2 === 0 ? "🐳" : "🧠"}
                        </span>
                        <span className="text-gray-100 font-medium" title={wallet.address ? topWalletTitle(wallet.address) : wallet.tooltip}>
                          {wallet.address ? topWalletLabel(wallet.address) : wallet.wallet}
                        </span>
                        <span className="hidden group-hover:block absolute top-full left-0 mt-1 z-20 text-xs bg-[#0f1318] border border-purple-500/30 rounded px-2 py-1 text-gray-200 whitespace-nowrap">
                          {wallet.tooltip}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-emerald-300">{wallet.winRate.toFixed(1)}%</td>
                    <td className="py-3 pr-3">{wallet.earlyEntry}</td>
                    <td className="py-3 pr-3">{wallet.cluster}</td>
                    <td className="py-3 pr-3">{wallet.consistency}</td>
                    <td className="py-3 pr-3">{wallet.signalStrength}</td>
                    <td className="py-3 pr-3">
                      <span className="inline-flex items-center gap-2 text-xs text-gray-300">
                        <span className={`h-2.5 w-2.5 rounded-full ${confidenceDot(wallet.signalStrength)}`} />
                        {confidenceLabel(wallet.signalStrength)}
                      </span>
                    </td>
                    <td className="py-3 pr-3">
                      <span className={`text-xs px-2 py-1 rounded border ${actionTone(wallet.signalStrength)}`}>
                        {suggestedAction(wallet.signalStrength, strategyMode, "wallet")}
                      </span>
                    </td>
                    <td className="py-3 text-emerald-300">+${formatUsdWhole(wallet.pnl30d)}</td>
                  </tr>
                  {openTopWallet === rowKey ? (
                    <tr className="bg-white/[0.02] border-b border-white/5">
                      <td colSpan={10} className="px-3 py-3 text-left">
                        <p className="text-xs font-semibold text-violet-200/90 mb-2">Detalle</p>
                        {wallet.address ? (
                          <p className="font-mono text-[11px] text-cyan-200/90 break-all mb-2" data-no-row-expand>
                            {wallet.address}
                          </p>
                        ) : null}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-gray-300">
                          <span>Win rate {wallet.winRate.toFixed(1)}%</span>
                          <span>Early {wallet.earlyEntry}</span>
                          <span>Cluster {wallet.cluster}</span>
                          <span>Consistency {wallet.consistency}</span>
                          <span>Sentinel {wallet.signalStrength}</span>
                          <span>30d +${formatUsdWhole(wallet.pnl30d)}</span>
                        </div>
                        <p className="text-[11px] text-gray-500 mt-2">{wallet.tooltip}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {wallet.address ? (
                            <Link
                              href={`/wallet/${encodeURIComponent(wallet.address)}`}
                              className="text-[11px] px-2 py-1 rounded border border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/20"
                            >
                              Ficha wallet
                            </Link>
                          ) : null}
                          <Link href="/smart-money?limit=50" className="text-[11px] px-2 py-1 rounded border border-white/15 text-gray-300 hover:bg-white/10">
                            Top 50 leaderboard
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:hidden">
            {rankedWallets.map((wallet, wIdx) => {
              const rowKey = String(wallet.address || wallet.wallet || `m-${wIdx}`);
              return (
                <div
                  key={rowKey}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (!isInteractiveEventTarget(e.target)) toggleTopWalletRow(rowKey);
                    }
                  }}
                  onClick={(e) => {
                    if (isInteractiveEventTarget(e.target)) return;
                    toggleTopWalletRow(rowKey);
                  }}
                  className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2 cursor-pointer hover:border-emerald-500/25"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-gray-100 inline-flex items-center gap-2 flex-wrap">
                      <span className="text-gray-500" aria-hidden>
                        <span style={{ display: "inline-block", transform: openTopWallet === rowKey ? "rotate(90deg)" : "none" }}>
                          <ChevronRight size={16} />
                        </span>
                      </span>
                      <span>{wIdx % 2 === 0 ? "🐳" : "🧠"}</span>
                      <span title={wallet.address ? topWalletTitle(wallet.address) : wallet.tooltip}>
                        {wallet.address ? topWalletLabel(wallet.address) : wallet.wallet}
                      </span>
                    </p>
                    <span className="text-emerald-300 text-xs">+${formatUsdWhole(wallet.pnl30d)}</span>
                  </div>
                  <p className="text-xs text-gray-500">{wallet.tooltip}</p>
                  <div className="grid grid-cols-3 gap-2 text-xs text-gray-300">
                    <span>WR {wallet.winRate.toFixed(1)}%</span>
                    <span>EE {wallet.earlyEntry}</span>
                    <span>CS {wallet.cluster}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 text-[11px] text-gray-300">
                      <span className={`h-2.5 w-2.5 rounded-full ${confidenceDot(wallet.signalStrength)}`} />
                      {confidenceLabel(wallet.signalStrength)}
                    </span>
                    <span className={`text-[11px] px-2 py-1 rounded border ${actionTone(wallet.signalStrength)}`}>
                      {suggestedAction(wallet.signalStrength, strategyMode, "wallet")}
                    </span>
                  </div>
                  {openTopWallet === rowKey ? (
                    <div
                      className="pt-2 border-t border-white/10 text-left"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {wallet.address ? (
                        <p className="font-mono text-[10px] text-cyan-200/80 break-all mb-2">{wallet.address}</p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        {wallet.address ? (
                          <Link
                            href={`/wallet/${encodeURIComponent(wallet.address)}`}
                            className="text-[10px] px-2 py-1 rounded border border-cyan-500/30 text-cyan-200"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Ficha wallet
                          </Link>
                        ) : null}
                        <Link
                          href="/smart-money?limit=50"
                          className="text-[10px] px-2 py-1 rounded border border-white/15 text-gray-300"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Top 50
                        </Link>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {isLoggedIn ? (
        <section className="sl-section">
          <div className="glass-card sl-inset">
            <h2 className="text-base font-semibold text-white mb-1">Tu contexto (demo)</h2>
            <p className="text-sm text-gray-400">A veces entraste tarde en señales parecidas. Esta aún se considera a tiempo: revisa riesgo antes de entrar.</p>
            <p className="text-sm text-emerald-300/90 mt-2">Sugerencia: valorar entrada</p>
          </div>
        </section>
      ) : (
        <section className="sl-section">
          <div className="glass-card sl-inset">
            <h2 className="text-base font-semibold text-white mb-1">Tu historial</h2>
            <p className="text-sm text-gray-500">Conecta cartera (próximamente) para ver pautas de timing según tu actividad.</p>
          </div>
        </section>
      )}

      <section className="sl-section">
        <div className="glass-card sl-inset border border-amber-500/20 bg-amber-500/[0.04]">
          <p className="text-[11px] text-amber-200/80 font-medium">Avisos sobre la señal en foco (heurístico)</p>
          {riskLines.length > 0 ? (
            <ul className="mt-2 text-sm text-amber-100/95 space-y-1">
              {riskLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400 mt-2">Sin alertas extra en esta señal. Sigue comprobando liquidez y contrato en la ficha del token.</p>
          )}
        </div>
      </section>

      <section className="sl-section">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm">
          <span className="text-gray-500">Tendencia (heat aprox.):</span>
          <span className={`${marketMood.className} font-medium`}>{marketMood.label}</span>
        </div>
      </section>

      <section className="sl-section">
        <div className="glass-card sl-inset flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Comparar dos tokens</h2>
            <p className="text-sm text-gray-500 mt-0.5">Mismo resumen, lado a lado (liquidez, nota, riesgo).</p>
          </div>
          <Link href="/compare" prefetch={false} className="text-sm font-medium text-cyan-300/90 hover:underline shrink-0">
            Abrir comparador
          </Link>
        </div>
      </section>

      <section className="sl-section">
        <div className="glass-card sl-inset">
          <h2 className="text-base font-semibold text-white">Alertas recientes</h2>
          <p className="text-sm text-gray-500 mt-0.5">Guardadas en este dispositivo si conectas cartera.</p>
          {!alerts.length ? (
            <p className="text-sm text-gray-600 text-center py-6">Aún no hay alertas</p>
          ) : (
            <div className="flex flex-col gap-2 mt-3">
              {alerts.map((item, idx) => (
                <div
                  key={`${item.tokenAddress}-${idx}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5"
                >
                  <span className="font-mono text-sm text-gray-200">{(item.symbol || item.tokenAddress || "").slice(0, 14)}</span>
                  <span className="text-xs text-gray-500">{item.alertType}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
