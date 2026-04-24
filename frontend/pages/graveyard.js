import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { RotateCcw, Scale, SquareTerminal } from "lucide-react";
import { PageHead } from "../components/seo/PageHead";
import { TerminalActionIcons } from "../components/terminal/TerminalActionIcons";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { useLocale } from "../contexts/LocaleContext";
import { isProbableSolanaMint } from "../lib/solanaMint.mjs";

async function fetchGraveyard({ from, to, outcome }) {
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  if (outcome && outcome !== "ALL") qs.set("outcome", outcome);
  const res = await fetch(`${getPublicApiUrl()}/api/v1/signals/graveyard?${qs.toString()}`);
  if (!res.ok) throw new Error("graveyard_fetch_failed");
  return res.json();
}

function pct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "N/A";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function compactMint(mint) {
  if (!mint || typeof mint !== "string") return "—";
  return `${mint.slice(0, 6)}…${mint.slice(-6)}`;
}

function formatLedgerTime(raw) {
  const t = raw ? new Date(raw) : null;
  if (!t || Number.isNaN(t.getTime())) return "—";
  return t.toLocaleString();
}

function outcomeClass(outcome) {
  if (outcome === "WIN") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (outcome === "LOSS") return "border-red-500/40 bg-red-500/10 text-red-200";
  return "border-white/10 bg-white/[0.03] text-gray-300";
}

function whyItMattered(row, t) {
  const runUp = Number(row.maxRunUpPct);
  const drawdown = Number(row.maxDrawdownPct);
  const result24h = Number(row.actualResult24h);
  if (Number.isFinite(runUp) && runUp >= 15) return t("graveyard.why.runup", { pct: pct(runUp) });
  if (Number.isFinite(drawdown) && drawdown <= -15) return t("graveyard.why.drawdown", { pct: pct(drawdown) });
  if (Number.isFinite(result24h) && Math.abs(result24h) >= 8) return t("graveyard.why.followThrough", { pct: pct(result24h) });
  return t("graveyard.why.audit");
}

export default function GraveyardPage() {
  const { t } = useLocale();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [outcome, setOutcome] = useState("ALL");

  const query = useQuery({
    queryKey: ["graveyard", from, to, outcome],
    queryFn: () => fetchGraveyard({ from, to, outcome }),
    refetchInterval: 60000
  });

  const rows = useMemo(() => query.data?.rows || [], [query.data]);
  const meta = query.data?.meta || {};

  return (
    <>
      <PageHead title={t("graveyard.pageTitle")} description={t("graveyard.pageDescription")} />
      <div className="sl-container py-8 space-y-4">
        <section className="glass-card sl-inset border-cyan-500/20 bg-cyan-500/[0.025]">
          <p className="sl-label">{t("graveyard.kicker")}</p>
          <h1 className="text-2xl font-semibold text-white mt-1">{t("graveyard.h1")}</h1>
          <p className="text-sm text-gray-400 mt-1 max-w-3xl leading-relaxed">{t("graveyard.intro")}</p>
          <div className="mt-4 flex flex-wrap gap-2 items-end">
            <label className="text-xs text-gray-400">
              {t("graveyard.from")}
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="sl-input h-10 mt-1" />
            </label>
            <label className="text-xs text-gray-400">
              {t("graveyard.to")}
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="sl-input h-10 mt-1" />
            </label>
            <label className="text-xs text-gray-400">
              {t("graveyard.outcome")}
              <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="sl-input h-10 mt-1">
                <option value="ALL">{t("graveyard.optAll")}</option>
                <option value="WIN">{t("graveyard.optWin")}</option>
                <option value="LOSS">{t("graveyard.optLoss")}</option>
                <option value="PENDING">{t("graveyard.optPending")}</option>
              </select>
            </label>
            <div className="ml-auto grid grid-cols-3 gap-2 text-right">
              <div className="rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2">
                <p className="text-[9px] uppercase tracking-[0.12em] text-gray-500">{t("graveyard.winRateLabel")}</p>
                <p className="font-mono text-sm font-semibold text-emerald-300">{Number(meta.winRate || 0).toFixed(2)}%</p>
              </div>
              <div className="rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2">
                <p className="text-[9px] uppercase tracking-[0.12em] text-gray-500">{t("graveyard.kpiResolved")}</p>
                <p className="font-mono text-sm font-semibold text-white">{Number(meta.resolved || 0)}</p>
              </div>
              <div className="rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2">
                <p className="text-[9px] uppercase tracking-[0.12em] text-gray-500">{t("graveyard.kpiRows")}</p>
                <p className="font-mono text-sm font-semibold text-white">{Number(meta.count || rows.length || 0)}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          {rows.map((r) => {
            const tokenOk = isProbableSolanaMint(r.token);
            return (
              <article
                key={r.id}
                className="glass-card sl-inset border-white/[0.08] bg-[#080a0d]/90"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-0.5 rounded border text-xs font-semibold ${outcomeClass(r.outcome)}`}>
                        {r.outcome}
                      </span>
                      <span className="font-mono text-xs text-cyan-200/90">{compactMint(r.token)}</span>
                      <span className="text-[10px] text-gray-500">{formatLedgerTime(r.createdAt)}</span>
                    </div>
                    <p className="mt-2 text-sm text-white font-semibold">{t("graveyard.whyTitle")}</p>
                    <p className="mt-1 text-sm text-gray-300 leading-relaxed">{whyItMattered(r, t)}</p>
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {[
                        [t("graveyard.thStrength"), Number(r.signalStrength || 0).toFixed(1)],
                        [t("graveyard.thAction"), r.suggestedAction || "—"],
                        [t("graveyard.th4h"), pct(r.actualResult4h)],
                        [t("graveyard.th24h"), pct(r.actualResult24h)],
                        [t("graveyard.thRunUp"), r.maxRunUpPct != null ? pct(r.maxRunUpPct) : "—"]
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-2.5 py-2">
                          <p className="text-[9px] uppercase tracking-[0.12em] text-gray-500">{label}</p>
                          <p className="mt-1 font-mono text-xs text-gray-100">{value}</p>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[10px] text-gray-600" title={t("graveyard.drawdownTitle")}>
                      {t("graveyard.thDrawdown")}: {r.maxDrawdownPct != null ? pct(r.maxDrawdownPct) : "—"} · {r.extremaSource || "checkpoint"}
                    </p>
                  </div>
                  <div className="w-full lg:w-[15rem] shrink-0 rounded-xl border border-white/[0.08] bg-black/20 p-3">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-gray-500 font-semibold">{t("graveyard.ctaTitle")}</p>
                    {tokenOk ? (
                      <>
                        <TerminalActionIcons mint={r.token} className="mt-2 justify-start" />
                        <div className="mt-3 grid gap-1.5">
                          <Link
                            href={`/token/${encodeURIComponent(r.token)}#flow`}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-[11px] font-semibold text-gray-200 no-underline hover:text-white"
                          >
                            <RotateCcw size={13} /> {t("graveyard.ctaReplay")}
                          </Link>
                          <Link
                            href={`/token/${encodeURIComponent(r.token)}`}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/[0.08] px-2.5 text-[11px] font-semibold text-violet-100 no-underline"
                          >
                            <SquareTerminal size={13} /> {t("graveyard.ctaDesk")}
                          </Link>
                          <Link
                            href={`/compare?tokens=${encodeURIComponent(r.token)}`}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-cyan-500/25 bg-cyan-500/[0.07] px-2.5 text-[11px] font-semibold text-cyan-100 no-underline"
                          >
                            <Scale size={13} /> {t("graveyard.ctaSimilar")}
                          </Link>
                        </div>
                      </>
                    ) : (
                      <p className="mt-2 text-xs text-gray-500">{t("graveyard.invalidMint")}</p>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
          {rows.length ? <p className="text-xs text-gray-500 mt-3 max-w-3xl leading-relaxed">{t("graveyard.extremaFoot")}</p> : null}
          {!rows.length && !query.isLoading ? <p className="text-sm text-gray-500 py-6">{t("graveyard.empty")}</p> : null}
        </section>
      </div>
    </>
  );
}
