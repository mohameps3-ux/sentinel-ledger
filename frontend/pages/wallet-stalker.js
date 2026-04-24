import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { PageHead } from "../components/seo/PageHead";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { useLocale } from "../contexts/LocaleContext";
import { isProbableSolanaMint } from "../lib/solanaMint.mjs";
import { groupWolfPackEvents } from "../lib/stalkerWolfPack.js";
import { TerminalActionIcons } from "../components/terminal/TerminalActionIcons";
import { buildSolscanAccountUrl, EXTERNAL_ANCHOR_REL } from "../lib/terminalLinks";

function authHeaders() {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function shortAddr(addr) {
  if (!addr || typeof addr !== "string") return "—";
  const s = addr.trim();
  if (s.length < 12) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

async function listStalkedWallets() {
  const res = await fetch(`${getPublicApiUrl()}/api/v1/wallet-stalker`, { headers: authHeaders() });
  if (!res.ok) throw new Error("wallet_stalker_list_failed");
  return res.json();
}

async function addWallet(wallet) {
  const res = await fetch(`${getPublicApiUrl()}/api/v1/wallet-stalker`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ wallet })
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.message || body.error || "wallet_stalker_add_failed");
  return body;
}

async function removeWallet(wallet) {
  const res = await fetch(`${getPublicApiUrl()}/api/v1/wallet-stalker/${wallet}`, {
    method: "DELETE",
    headers: authHeaders()
  });
  if (!res.ok) throw new Error("wallet_stalker_remove_failed");
  return res.json();
}

export default function WalletStalkerPage() {
  const { t } = useLocale();
  const qc = useQueryClient();
  const [wallet, setWallet] = useState("");
  const [rawEvents, setRawEvents] = useState([]);
  const query = useQuery({
    queryKey: ["wallet-stalker"],
    queryFn: listStalkedWallets
  });

  const refreshEvents = useCallback(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("walletStalkerEvents") || "[]");
      setRawEvents(Array.isArray(raw) ? raw : []);
    } catch {
      setRawEvents([]);
    }
  }, []);

  useEffect(() => {
    refreshEvents();
    window.addEventListener("wallet-stalker-update", refreshEvents);
    return () => window.removeEventListener("wallet-stalker-update", refreshEvents);
  }, [refreshEvents]);

  const grouped = useMemo(() => groupWolfPackEvents(rawEvents), [rawEvents]);
  const actorStats = useMemo(() => {
    const stats = new Map();
    const ensure = (walletAddr) => {
      const key = String(walletAddr || "");
      if (!key) return null;
      if (!stats.has(key)) stats.set(key, { events: 0, doubleDowns: 0, tokens: new Set(), clusterOverlaps: 0 });
      return stats.get(key);
    };
    for (const ev of rawEvents) {
      const s = ensure(ev?.wallet);
      if (!s) continue;
      s.events += 1;
      if (ev?.tokenAddress) s.tokens.add(String(ev.tokenAddress));
      if (ev?.enrichment?.conviction === "DOUBLE_DOWN") s.doubleDowns += 1;
    }
    for (const item of grouped) {
      if (item.kind !== "WOLF_PACK") continue;
      for (const w of item.wallets || []) {
        const s = ensure(w);
        if (s) s.clusterOverlaps += 1;
      }
    }
    return stats;
  }, [rawEvents, grouped]);

  const clearActivity = useCallback(() => {
    try {
      localStorage.removeItem("walletStalkerEvents");
      localStorage.setItem("walletStalkerUnread", "0");
      window.dispatchEvent(new Event("wallet-stalker-update"));
      toast.success(t("stalker.toast.cleared"));
    } catch {
      toast.error(t("stalker.toast.addErr"));
    }
  }, [t]);

  const addMut = useMutation({
    mutationFn: addWallet,
    onSuccess: async () => {
      setWallet("");
      await qc.invalidateQueries({ queryKey: ["wallet-stalker"] });
      toast.success(t("stalker.toast.added"));
    },
    onError: (e) => toast.error(e.message || t("stalker.toast.addErr"))
  });
  const delMut = useMutation({
    mutationFn: removeWallet,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["wallet-stalker"] });
      toast.success(t("stalker.toast.removed"));
    }
  });

  const list = query.data?.data || [];

  return (
    <>
      <PageHead title={t("stalker.pageTitle")} description={t("stalker.pageDesc")} />
      <div className="sl-container py-8 space-y-4">
        <section className="glass-card sl-inset">
          <p className="sl-label">{t("stalker.label")}</p>
          <h1 className="text-2xl text-white font-semibold mt-1">{t("stalker.h1")}</h1>
          <p className="text-sm text-gray-400 mt-1">{t("stalker.sub")}</p>
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const v = wallet.trim();
              if (!v) return;
              addMut.mutate(v);
            }}
          >
            <input
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              placeholder={t("stalker.placeholder")}
              className="sl-input h-11"
            />
            <button type="submit" className="btn-primary px-4" disabled={addMut.isPending}>
              {t("stalker.track")}
            </button>
          </form>
        </section>

        <section className="glass-card sl-inset">
          <p className="sl-label">{t("stalker.listLabel")}</p>
          <div className="mt-2 space-y-2">
            {list.map((row) => (
              <div
                key={row.stalked_wallet}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mono text-xs text-gray-200">
                      {row.stalked_wallet?.slice(0, 6)}...{row.stalked_wallet?.slice(-6)}
                    </span>
                    <a
                      href={buildSolscanAccountUrl(row.stalked_wallet)}
                      target="_blank"
                      rel={EXTERNAL_ANCHOR_REL}
                      className="text-[10px] text-cyan-200/85 hover:text-cyan-100"
                    >
                      Solscan
                    </a>
                  </div>
                  {(() => {
                    const s = actorStats.get(row.stalked_wallet);
                    if (!s) return null;
                    const ddRate = s.events ? Math.round((s.doubleDowns / s.events) * 100) : 0;
                    return (
                      <p className="mt-1 text-[10px] font-mono text-gray-500">
                        consistency {s.events} events · early tokens {s.tokens.size} · double-down {ddRate}% · cluster overlap {s.clusterOverlaps}
                      </p>
                    );
                  })()}
                </div>
                <button
                  type="button"
                  onClick={() => delMut.mutate(row.stalked_wallet)}
                  className="text-xs text-red-300 hover:text-red-200"
                >
                  {t("stalker.remove")}
                </button>
              </div>
            ))}
            {!list.length && !query.isLoading ? <p className="text-sm text-gray-500">{t("stalker.empty")}</p> : null}
          </div>
        </section>

        <section className="glass-card sl-inset border-violet-500/20">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="sl-label text-violet-200/90">{t("stalker.f3Title")}</p>
              <p className="text-sm text-gray-400 mt-1 max-w-2xl leading-snug">{t("stalker.f3Sub")}</p>
              <p className="text-[10px] text-gray-500 mt-2 max-w-2xl leading-snug">{t("stalker.f4Help")}</p>
            </div>
            {rawEvents.length ? (
              <button
                type="button"
                onClick={clearActivity}
                className="text-[11px] px-2.5 py-1 rounded-lg border border-white/15 text-gray-400 hover:text-gray-200 hover:border-white/25 shrink-0"
              >
                {t("stalker.clearActivity")}
              </button>
            ) : null}
          </div>
          <p className="text-[11px] font-semibold text-gray-300 mt-4">{t("stalker.activityLabel")}</p>
          <div className="mt-2 space-y-2">
            {!grouped.length ? <p className="text-sm text-gray-500">{t("stalker.activityEmpty")}</p> : null}
            {grouped.map((item, idx) => {
              if (item.kind === "WOLF_PACK") {
                const tok = String(item.tokenAddress || "");
                const tokenOk = isProbableSolanaMint(tok);
                const tEnd = item.windowEndMs ? new Date(item.windowEndMs).toLocaleString() : "—";
                const walletLine = item.wallets.map((w) => shortAddr(w)).join(" · ");
                return (
                  <div
                    key={`wp-${tok}-${item.windowEndMs}-${idx}`}
                    className="rounded-lg border border-violet-500/35 bg-gradient-to-r from-violet-950/35 via-violet-950/15 to-transparent px-3 py-2.5"
                  >
                    <p className="text-[11px] font-semibold text-violet-100">
                      {t("stalker.wolfPackTitle", { n: String(item.packCount) })}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      {tokenOk ? (
                        <Link href={`/token/${tok}`} className="mono text-xs text-cyan-200/90 hover:text-cyan-100">
                          {shortAddr(tok)}
                        </Link>
                      ) : (
                        <span className="mono text-xs text-gray-500">{shortAddr(tok)}</span>
                      )}
                      <span className="text-[10px] text-gray-500">{tEnd}</span>
                    </div>
                    <p className="text-[10px] text-violet-200/80 font-mono mt-1.5 break-all">{walletLine}</p>
                    <p className="text-[9px] text-violet-300/70 mt-1.5 leading-snug">{t("stalker.wolfPackHint")}</p>
                    {tokenOk ? <TerminalActionIcons mint={tok} className="mt-2 justify-start" /> : null}
                  </div>
                );
              }
              const ev = item.event || {};
              const en = ev.enrichment && typeof ev.enrichment === "object" ? ev.enrichment : {};
              const sig = ev.signature || idx;
              const w = shortAddr(ev.wallet);
              const typ = String(ev.type || "—");
              const tok = ev.tokenAddress && isProbableSolanaMint(String(ev.tokenAddress)) ? (
                <Link href={`/token/${ev.tokenAddress}`} className="text-cyan-200/85 hover:text-cyan-100">
                  {shortAddr(ev.tokenAddress)}
                </Link>
              ) : ev.tokenAddress ? (
                <span className="text-gray-500">{shortAddr(ev.tokenAddress)}</span>
              ) : null;
              const f4 =
                en.conviction === "DOUBLE_DOWN" &&
                en.convictionMultiplier != null &&
                Number.isFinite(Number(en.convictionMultiplier));
              const poolLine =
                en.impactLevel &&
                en.impactLevel !== "UNKNOWN" &&
                en.impactPoolPct != null &&
                Number.isFinite(Number(en.impactPoolPct))
                  ? t("stalker.poolImpactLine", {
                      level: String(en.impactLevel),
                      pct: String(en.impactPoolPct)
                    })
                  : null;
              return (
                <div
                  key={`at-${sig}-${ev.timestamp}`}
                  className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-gray-300"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono text-gray-200">{t("stalker.atomicLine", { type: typ, wallet: w })}</span>
                    {tok ? <span className="inline-flex items-center gap-1">· {tok}</span> : null}
                    {f4 ? (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-500/50 bg-amber-500/15 text-amber-100">
                        {t("stalker.f4Badge", { mult: String(en.convictionMultiplier) })}
                      </span>
                    ) : null}
                  </div>
                  {poolLine ? <p className="text-[9px] text-gray-500 mt-1 font-mono">{poolLine}</p> : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {ev.tokenAddress && isProbableSolanaMint(String(ev.tokenAddress)) ? (
                      <TerminalActionIcons mint={String(ev.tokenAddress)} className="justify-start" />
                    ) : null}
                    {ev.wallet ? (
                      <a
                        href={buildSolscanAccountUrl(ev.wallet)}
                        target="_blank"
                        rel={EXTERNAL_ANCHOR_REL}
                        className="inline-flex h-7 items-center rounded-md border border-white/10 bg-white/[0.04] px-2 text-[11px] font-semibold text-gray-200 hover:text-white"
                      >
                        Wallet Solscan
                      </a>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}
