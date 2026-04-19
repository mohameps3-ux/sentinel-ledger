import Link from "next/link";
import { Copy, ExternalLink, Globe, Radio, Shield, TrendingUp } from "lucide-react";
import toast from "react-hot-toast";

function tri(v) {
  if (v === true) return { label: "YES", cls: "text-emerald-300 border-emerald-500/35 bg-emerald-500/10" };
  if (v === false) return { label: "NO", cls: "text-amber-200 border-amber-500/35 bg-amber-500/10" };
  return { label: "UNK", cls: "text-gray-400 border-white/10 bg-white/[0.04]" };
}

function pctBar(pct) {
  const n = Math.min(100, Math.max(0, Number(pct) || 0));
  return (
    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden border border-white/[0.06] min-w-[72px]">
      <div className="h-full bg-gradient-to-r from-violet-500/80 to-cyan-500/70" style={{ width: `${n}%` }} />
    </div>
  );
}

export function TokenIntelDeck({ address, market, security, terminal, smartMoneyForToken, deployer }) {
  const soc = market?.socials || {};
  const dexPairs = Array.isArray(market?.dexPairs) ? market.dexPairs : [];
  const hp =
    security?.honeypot === "flagged"
      ? { label: "FLAG", cls: "text-red-300 border-red-500/40 bg-red-500/10" }
      : tri(null);
  const ver = tri(security?.verifiedListingTag === true ? true : null);
  const mint = tri(security?.mintRenounced === true);
  const frz = tri(security?.freezeAuthorityInactive === true);
  const lp = tri(security?.liquidityLocked === true ? true : security?.liquidityLocked === false ? false : null);

  const action = String(terminal?.suggestedAction || "WATCH");
  const actionCls =
    action === "ACCUMULATE"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : action === "TOO_LATE"
        ? "border-red-500/35 bg-red-500/10 text-red-200"
        : "border-amber-500/35 bg-amber-500/10 text-amber-100";

  const copyMint = async () => {
    try {
      await navigator.clipboard.writeText(address);
      toast.success("Contract copied.");
    } catch {
      toast.error("Copy failed.");
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
      <section className="glass-card sl-inset xl:col-span-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="sl-label">Contract</p>
            <p className="mono text-[11px] text-gray-400 break-all mt-1 leading-relaxed">{address}</p>
          </div>
          <button
            type="button"
            onClick={copyMint}
            className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] text-xs text-gray-200 hover:bg-white/[0.08]"
          >
            <Copy size={14} />
            Copy
          </button>
        </div>
        <div className="sl-divider" />
        <div>
          <p className="sl-label mb-2">Narratives</p>
          <div className="flex flex-wrap gap-2">
            {(market?.narrativeTags || []).slice(0, 6).map((tag) => (
              <span
                key={tag}
                className="px-2 py-1 rounded-md border border-violet-500/30 bg-violet-500/10 text-[11px] text-violet-200"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className="sl-divider" />
        <div>
          <p className="sl-label mb-2">Social</p>
          <div className="flex flex-wrap gap-2">
            {(soc.websites || []).slice(0, 3).map((u) => (
              <a
                key={u}
                href={u}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] text-xs text-cyan-200 hover:bg-white/[0.07]"
              >
                <Globe size={14} />
                Website
                <ExternalLink size={12} className="opacity-60" />
              </a>
            ))}
            {soc.twitter ? (
              <a
                href={soc.twitter}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] text-xs text-sky-200 hover:bg-white/[0.07]"
              >
                Twitter
                <ExternalLink size={12} className="opacity-60" />
              </a>
            ) : null}
            {soc.telegram ? (
              <a
                href={soc.telegram}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] text-xs text-sky-200 hover:bg-white/[0.07]"
              >
                Telegram
                <ExternalLink size={12} className="opacity-60" />
              </a>
            ) : null}
            {!soc.twitter && !soc.telegram && !(soc.websites || []).length ? (
              <span className="text-xs text-gray-500">No socials indexed on the top DEX pool yet.</span>
            ) : null}
          </div>
        </div>
      </section>

      <section className="glass-card sl-inset xl:col-span-4 space-y-3">
        <p className="sl-label inline-flex items-center gap-2">
          <Shield size={14} className="text-violet-300/90" />
          Security report
        </p>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
            <div className="text-gray-500 uppercase tracking-wide">Honeypot (DEX tag)</div>
            <div className={`mt-1 inline-flex px-2 py-0.5 rounded border font-semibold ${hp.cls}`}>{hp.label}</div>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
            <div className="text-gray-500 uppercase tracking-wide">Verified tag</div>
            <div className={`mt-1 inline-flex px-2 py-0.5 rounded border font-semibold ${ver.cls}`}>{ver.label}</div>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
            <div className="text-gray-500 uppercase tracking-wide">Mint renounced</div>
            <div className={`mt-1 inline-flex px-2 py-0.5 rounded border font-semibold ${mint.cls}`}>{mint.label}</div>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
            <div className="text-gray-500 uppercase tracking-wide">Freeze off</div>
            <div className={`mt-1 inline-flex px-2 py-0.5 rounded border font-semibold ${frz.cls}`}>{frz.label}</div>
          </div>
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 col-span-2">
            <div className="text-gray-500 uppercase tracking-wide">Liquidity locked</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className={`inline-flex px-2 py-0.5 rounded border font-semibold ${lp.cls}`}>{lp.label}</span>
              {security?.lpLockDetail ? (
                <span className="text-gray-500 text-[10px] leading-snug">{security.lpLockDetail}</span>
              ) : null}
            </div>
          </div>
        </div>
        <p className="text-[10px] text-gray-600 leading-relaxed">
          On-chain mint/freeze from RPC; honeypot/LP hints from DEX listings. This is surveillance, not a guarantee.
        </p>
      </section>

      <section className="glass-card sl-inset xl:col-span-3 space-y-3">
        <p className="sl-label inline-flex items-center gap-2">
          <TrendingUp size={14} className="text-emerald-300/90" />
          Signal
        </p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-gray-500">Strength</span>
          <span className="mono text-sm text-white tabular-nums">{Number(terminal?.signalStrength || 0)}</span>
        </div>
        {pctBar(terminal?.signalStrength)}
        <div className={`rounded-lg border px-3 py-2.5 ${actionCls}`}>
          <div className="text-[10px] uppercase tracking-wide text-gray-300/90">Suggested action</div>
          <div className="text-lg font-bold tracking-tight mt-0.5">{action}</div>
          <p className="text-[11px] text-gray-200/90 mt-2 leading-relaxed">{terminal?.rationale}</p>
        </div>
      </section>

      <section className="glass-card sl-inset xl:col-span-7 space-y-3">
        <p className="sl-label inline-flex items-center gap-2">
          <Radio size={14} className="text-cyan-300/90" />
          DEX venues · trade links
        </p>
        <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
          {dexPairs.length === 0 ? (
            <p className="text-xs text-gray-500">No routed pools returned.</p>
          ) : (
            dexPairs.map((p) => (
              <div
                key={`${p.dexId}-${p.pairAddress || p.url}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm text-white font-medium capitalize">{p.dexId}</div>
                  <div className="text-[10px] text-gray-500 mono truncate">
                    {p.quoteSymbol ? `${p.quoteSymbol} · ` : ""}${p.labels?.length ? p.labels.join(", ") : "pool"}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 shrink-0">
                  {p.url ? (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2 py-1 rounded-md border border-white/10 bg-white/[0.04] text-[11px] text-gray-200 hover:bg-white/[0.08] inline-flex items-center gap-1"
                    >
                      Chart <ExternalLink size={11} />
                    </a>
                  ) : null}
                  {p.jupiterSwapUrl ? (
                    <a
                      href={p.jupiterSwapUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2 py-1 rounded-md border border-cyan-500/25 bg-cyan-500/10 text-[11px] text-cyan-100 hover:bg-cyan-500/15 inline-flex items-center gap-1"
                    >
                      Jupiter <ExternalLink size={11} />
                    </a>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="glass-card sl-inset xl:col-span-5 space-y-3">
        {deployer ? (
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
            <p className="text-[11px] text-gray-400 uppercase tracking-wide">Deployer DNA</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs text-gray-300">{deployer.deployerLabel || "First Launch"}</span>
              <span className="text-xs text-emerald-300">
                {Number(deployer.successRate || 0).toFixed(1)}% success
              </span>
            </div>
            <div className="mt-1 text-[11px] text-gray-500">
              Launches: {deployer.totalLaunches || 0} · Avg time to rug:{" "}
              {deployer.averageHoursToRug != null ? `${Number(deployer.averageHoursToRug).toFixed(1)}h` : "N/A"}
            </div>
          </div>
        ) : null}
        <p className="sl-label">Smart wallets on this mint</p>
        {!smartMoneyForToken?.length ? (
          <p className="text-xs text-gray-500">No ranked wallets linked to this mint in the database snapshot.</p>
        ) : (
          <ul className="space-y-2">
            {smartMoneyForToken.slice(0, 8).map((w) => (
              <li
                key={w.wallet}
                className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2"
              >
                <Link href={`/smart-money`} className="mono text-[11px] text-cyan-200/90 hover:underline truncate">
                  {w.wallet?.slice(0, 4)}…{w.wallet?.slice(-4)}
                </Link>
                <span className="text-[11px] text-emerald-300 tabular-nums shrink-0">
                  {Number(w.winRate || 0).toFixed(1)}% WR
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[10px] text-gray-600">PRO panel still streams live on-chain ranks when authenticated.</p>
      </section>
    </div>
  );
}
