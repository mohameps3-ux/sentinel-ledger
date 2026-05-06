import { CheckCircle2, FileText } from "lucide-react";
import { buildNarrativeLines } from "../../lib/scannerTerminalModel.mjs";

export function ScannerNarrativeContext({ token, t }) {
  const lines = token ? buildNarrativeLines(token, t) : [];

  return (
    <div className="px-4 py-5 sm:px-6">
      <div className="mb-4 flex items-center gap-2">
        <FileText size={15} className="text-zinc-500" />
        <p className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">{t("scanner.narrativeLabel")}</p>
      </div>
      {!token ? (
        <p className="rounded-md border border-white/[0.08] bg-white/[0.025] px-3 py-4 text-xs text-zinc-600">
          {t("scanner.narrative.needFocus")}
        </p>
      ) : (
        <ul className="grid gap-2 lg:grid-cols-3">
          {lines.map((line) => (
            <li key={line} className="flex min-w-0 items-start gap-2 rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-3">
              <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-300/80" />
              <span className="text-[12px] leading-relaxed text-zinc-300">{line}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
