import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHead } from "../components/seo/PageHead";
import { getPublicApiUrl } from "../lib/publicRuntime";
import { useLocale } from "../contexts/LocaleContext";

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
        <section className="glass-card sl-inset">
          <p className="sl-label">{t("graveyard.kicker")}</p>
          <h1 className="text-2xl font-semibold text-white mt-1">{t("graveyard.h1")}</h1>
          <p className="text-sm text-gray-400 mt-1">{t("graveyard.intro")}</p>
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
            <div className="ml-auto text-sm text-emerald-300">
              {t("graveyard.winRateLabel")}{" "}
              <span className="font-semibold">{Number(meta.winRate || 0).toFixed(2)}%</span>
            </div>
          </div>
        </section>

        <section className="glass-card sl-inset overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-gray-400 border-b border-white/10">
              <tr>
                <th className="text-left py-2">{t("graveyard.thToken")}</th>
                <th className="text-left py-2">{t("graveyard.thStrength")}</th>
                <th className="text-left py-2">{t("graveyard.thAction")}</th>
                <th className="text-left py-2">{t("graveyard.th4h")}</th>
                <th className="text-left py-2">{t("graveyard.th24h")}</th>
                <th className="text-left py-2">{t("graveyard.thOutcome")}</th>
                <th className="text-left py-2" title={t("graveyard.runUpTitle")}>
                  {t("graveyard.thRunUp")}
                </th>
                <th className="text-left py-2" title={t("graveyard.drawdownTitle")}>
                  {t("graveyard.thDrawdown")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-white/[0.05]">
                  <td className="py-2 mono text-xs">
                    {r.token?.slice(0, 6)}...{r.token?.slice(-6)}
                  </td>
                  <td className="py-2">{Number(r.signalStrength || 0).toFixed(1)}</td>
                  <td className="py-2">{r.suggestedAction}</td>
                  <td className="py-2">{pct(r.actualResult4h)}</td>
                  <td className="py-2">{pct(r.actualResult24h)}</td>
                  <td className="py-2">
                    <span
                      className={`px-2 py-0.5 rounded border text-xs ${
                        r.outcome === "WIN"
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                          : r.outcome === "LOSS"
                            ? "border-red-500/40 bg-red-500/10 text-red-200"
                            : "border-white/10 bg-white/[0.03] text-gray-300"
                      }`}
                    >
                      {r.outcome}
                    </span>
                  </td>
                  <td className="py-2 text-gray-200" title={t("graveyard.runUpTitle")}>
                    {r.maxRunUpPct != null && Number.isFinite(Number(r.maxRunUpPct)) ? pct(r.maxRunUpPct) : "—"}
                  </td>
                  <td className="py-2 text-gray-200" title={t("graveyard.drawdownTitle")}>
                    {r.maxDrawdownPct != null && Number.isFinite(Number(r.maxDrawdownPct)) ? pct(r.maxDrawdownPct) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length ? <p className="text-xs text-gray-500 mt-3 max-w-3xl leading-relaxed">{t("graveyard.extremaFoot")}</p> : null}
          {!rows.length && !query.isLoading ? <p className="text-sm text-gray-500 py-6">{t("graveyard.empty")}</p> : null}
        </section>
      </div>
    </>
  );
}
