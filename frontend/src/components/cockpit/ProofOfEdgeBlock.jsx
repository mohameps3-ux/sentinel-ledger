import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPublicApiUrl } from "../../../lib/publicRuntime";
import { useLocale } from "../../../contexts/LocaleContext";

function fmtPct(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  const n = Math.round(Number(v) * 10) / 10;
  const sign = n > 0 ? "+" : "";
  return `${sign}${n}%`;
}

function fmtHit(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `${Math.round(Number(v))}%`;
}

async function fetchDeskProofOfEdge({ mint, confidence, regime }) {
  const u = new URL(`${getPublicApiUrl()}/api/v1/signals/desk-proof-of-edge`);
  if (mint) u.searchParams.set("mint", mint);
  if (confidence != null && Number.isFinite(confidence)) u.searchParams.set("confidence", String(Math.round(confidence)));
  if (regime) u.searchParams.set("regime", regime);
  const r = await fetch(u.toString());
  if (!r.ok) throw new Error("desk_proof_of_edge");
  return r.json();
}

function useAgeSeconds(iso) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    if (!iso) return undefined;
    const tick = () => {
      const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
      setSec(Number.isFinite(s) ? s : 0);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [iso]);
  return sec;
}

/**
 * Zone C — always-visible quantitative proof block (no accordion).
 */
export function ProofOfEdgeBlock({ mint, confidence, regime }) {
  const { t, locale } = useLocale();
  const listLocale =
    locale === "zh" ? "zh-Hans" : locale === "pt" ? "pt-BR" : locale === "ar" ? "ar" : locale;

  const q = useQuery({
    queryKey: ["desk-proof-of-edge", mint || "", confidence ?? null, regime || ""],
    queryFn: () => fetchDeskProofOfEdge({ mint: mint || "", confidence, regime }),
    staleTime: 45_000,
    refetchInterval: 60_000,
    enabled: Boolean(mint)
  });

  const updatedIso = q.data?.updatedAt || (q.dataUpdatedAt ? new Date(q.dataUpdatedAt).toISOString() : "");
  const ageSec = useAgeSeconds(q.isSuccess ? updatedIso : "");

  const footerAge = useMemo(() => {
    if (!q.isSuccess) return "—";
    if (ageSec < 90) return t("cockpit.proof.ageSeconds", { sec: ageSec });
    const m = Math.floor(ageSec / 60);
    return t("cockpit.proof.ageMinutes", { min: m });
  }, [q.isSuccess, ageSec, t]);

  const h = q.data?.horizons;
  const hits = q.data?.hits;
  const sufficient = Boolean(q.data?.sufficient);
  const n = Number(q.data?.comparableCount || 0);

  return (
    <section
      className="rounded-lg border border-white/[0.08] bg-black/[0.22] px-3 py-2.5 sm:px-3.5 sm:py-3 shrink-0"
      aria-label={t("cockpit.proof.title")}
    >
      <div className="flex flex-wrap items-start justify-between gap-2 gap-y-1 border-b border-white/[0.06] pb-2 mb-2.5">
        <div className="min-w-0">
          <h3 className="text-[12px] sm:text-sm font-semibold text-gray-100 tracking-tight flex items-center gap-1.5">
            <span className="select-none" aria-hidden>
              🧠
            </span>
            {t("cockpit.proof.title")}
          </h3>
          <p className="text-[10px] sm:text-[11px] text-gray-500 mt-0.5 italic leading-snug">{t("cockpit.proof.subtitle")}</p>
        </div>
        <div
          className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full border font-semibold tabular-nums ${
            sufficient
              ? "border-emerald-500/35 text-emerald-100/95 bg-emerald-500/10"
              : "border-amber-500/30 text-amber-100/90 bg-amber-500/10"
          }`}
        >
          {q.isPending ? "…" : t("cockpit.proof.similarSignals", { n: n.toLocaleString(listLocale) })}
        </div>
      </div>

      {q.isPending ? (
        <p className="text-[11px] text-gray-500 font-mono py-2">{t("cockpit.proof.loading")}</p>
      ) : q.isError ? (
        <p className="text-[11px] text-amber-200/90 py-2">{t("cockpit.proof.error")}</p>
      ) : !sufficient ? (
        <div className="py-1">
          <p className="text-[11px] sm:text-xs text-gray-400 leading-relaxed">
            <span className="text-gray-200 font-medium not-italic">{t("cockpit.proof.insufficientTitle")}</span>
            <span className="block text-[10px] text-gray-500 mt-1.5 font-mono">
              {t("cockpit.proof.insufficientMeta", {
                min: q.data?.meta?.minSample ?? "—",
                days: q.data?.meta?.lookbackDays ?? "—"
              })}
            </span>
          </p>
          {q.data?.criteriaLine ? (
            <p className="text-[9px] sm:text-[10px] text-gray-600 leading-relaxed mt-2 border-t border-white/[0.05] pt-2">
              {t("cockpit.proof.basedOn")} <span className="text-gray-500 font-mono">{q.data.criteriaLine}</span>
            </p>
          ) : null}
          <p className="text-[9px] text-gray-600 font-mono mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5">
            <span>{t("cockpit.proof.updated", { age: footerAge })}</span>
            <span className="text-gray-700">·</span>
            <span className="text-gray-500">{t("cockpit.proof.disclaimer")}</span>
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 sm:gap-3 text-center mb-3">
            {["m5", "m30", "m2h"].map((key) => {
              const cell = h?.[key];
              return (
                <div key={key} className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">{cell?.label}</div>
                  <div className="text-lg sm:text-xl font-mono font-bold tabular-nums text-gray-100 tracking-tight">
                    {fmtPct(cell?.avgPct)}
                  </div>
                  {cell?.n != null && cell.n > 0 ? (
                    <div className="text-[9px] text-gray-600 font-mono mt-0.5">n={cell.n}</div>
                  ) : (
                    <div className="text-[9px] text-gray-600 font-mono mt-0.5">—</div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-3 text-center border-t border-white/[0.06] pt-2.5 mb-2">
            <div>
              <div className="text-[9px] uppercase tracking-wide text-gray-500 font-semibold mb-0.5">{t("cockpit.proof.hit40")}</div>
              <div className="text-sm font-mono font-semibold tabular-nums text-gray-200">{fmtHit(hits?.hit40m30Pct)}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wide text-gray-500 font-semibold mb-0.5">{t("cockpit.proof.hit100")}</div>
              <div className="text-sm font-mono font-semibold tabular-nums text-gray-200">{fmtHit(hits?.hit100m2hPct)}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wide text-gray-500 font-semibold mb-0.5">{t("cockpit.proof.median")}</div>
              <div className="text-sm font-mono font-semibold tabular-nums text-gray-200">{fmtPct(q.data?.medianPct)}</div>
            </div>
          </div>
        </>
      )}

      <p className="text-[9px] sm:text-[10px] text-gray-600 leading-relaxed mt-1 border-t border-white/[0.05] pt-2">
        {t("cockpit.proof.basedOn")}{" "}
        <span className="text-gray-500 font-mono">{q.data?.criteriaLine || t("cockpit.proof.criteriaFallback")}</span>
      </p>

      <p className="text-[9px] text-gray-600 font-mono mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5">
        <span>{t("cockpit.proof.updated", { age: footerAge })}</span>
        <span className="text-gray-700">·</span>
        <span className="text-gray-500">{t("cockpit.proof.disclaimer")}</span>
      </p>
    </section>
  );
}
