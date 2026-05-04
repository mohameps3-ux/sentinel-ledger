import { buildNarrativeLines } from "../../lib/scannerTerminalModel.mjs";

export function ScannerNarrativeContext({ token, t }) {
  const lines = token ? buildNarrativeLines(token, t) : [];

  return (
    <div className="px-4 py-5 sm:px-5">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">{t("scanner.narrativeLabel")}</p>
      {!token ? (
        <p className="mt-4 text-xs text-zinc-600">{t("scanner.narrative.needFocus")}</p>
      ) : (
        <ul className="mt-4 space-y-2 border-l border-zinc-800 pl-4">
          {lines.map((line) => (
            <li key={line} className="text-[13px] leading-snug text-zinc-300">
              <span className="font-mono text-zinc-600">—</span> <span className="ml-1">{line}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
