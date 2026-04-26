import { useState, useEffect, useCallback } from "react";
import { ArrowRight, Search } from "lucide-react";
import { useRouter } from "next/router";
import toast from "react-hot-toast";
import { isProbableSolanaMint } from "../../lib/solanaMint.mjs";

function readRecents() {
  try {
    const raw = localStorage.getItem("sentinel-recents");
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveRecent(mint) {
  try {
    const prev = readRecents();
    const next = [mint, ...prev.filter((x) => x !== mint)].slice(0, 5);
    localStorage.setItem("sentinel-recents", JSON.stringify(next));
  } catch {
    // ignore
  }
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.compact]
 * @param {boolean} [opts.withRecents] — show recent mint chips (home header)
 * @param {boolean} [opts.headerMicro] — ~2cm strip on home: tiny field + icon submit
 * @param {boolean} [opts.navCommand] — navbar command input; submit button can live outside via form attr
 * @param {string} [opts.formId]
 */
export function SearchBar({ compact = false, withRecents = false, headerMicro = false, navCommand = false, formId = "navbar-token-search" } = {}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState([]);

  const syncRecents = useCallback(() => {
    if (typeof window === "undefined") return;
    setRecents(readRecents().slice(0, 5));
  }, []);

  useEffect(() => {
    syncRecents();
  }, [syncRecents]);

  const onSearch = (e) => {
    e.preventDefault();
    const value = query.trim();
    if (value.length < 32 || value.length > 44) {
      toast.error("Paste a valid Solana mint (32-44 chars).");
      return;
    }
    if (!isProbableSolanaMint(value)) {
      toast.error("Not a valid Solana mint (base58).");
      return;
    }
    saveRecent(value);
    setRecents(readRecents().slice(0, 5));
    router.push(`/token/${value}`);
    setQuery("");
  };

  const h = headerMicro ? "h-7" : compact ? "h-9" : "h-11";
  const icon = headerMicro ? 12 : compact ? 14 : 16;
  const ph = headerMicro
    ? "Mint…"
    : compact
      ? "Mint (32–44 chars)…"
      : "Paste Solana token address...";
  const inputCls = headerMicro
    ? "bg-transparent border-none outline-none w-full min-w-0 text-[10px] text-gray-100 placeholder:text-gray-500"
    : compact
      ? "bg-transparent border-none outline-none w-full font-mono text-xs text-sl-text placeholder:text-sl-muted"
      : "bg-transparent border-none outline-none w-full text-sm text-gray-100 placeholder:text-gray-500";

  if (navCommand) {
    return (
      <form id={formId} onSubmit={onSearch} className="relative flex w-full max-w-[380px] items-center">
        <Search size={14} className="absolute left-2.5 text-sl-muted" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={ph}
          autoComplete="off"
          spellCheck={false}
          className="h-8 w-full border border-sl-border bg-sl-root pl-8 pr-16 font-mono text-xs text-sl-text outline-none transition-colors duration-150 placeholder:text-sl-muted focus:border-sl-violet focus:ring-0"
        />
        <span className="absolute right-2 border border-sl-border bg-sl-card px-1.5 py-0.5 font-mono text-2xs text-sl-muted">
          Ctrl+K
        </span>
      </form>
    );
  }

  if (headerMicro) {
    return (
      <div className="w-full min-w-0 max-w-[5.5rem] sm:max-w-[6.25rem]">
        <form onSubmit={onSearch} className="w-full flex items-center gap-0.5">
          <div className={`sl-input ${h} pl-1 pr-0.5 flex items-center gap-0.5 flex-1 min-w-0`}>
            <Search size={icon} className="text-gray-500 shrink-0" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={ph}
              autoComplete="off"
              spellCheck={false}
              className={inputCls}
            />
          </div>
          <button
            type="submit"
            className="btn-pro btn-pro-sm h-7 w-7 p-0 shrink-0 flex items-center justify-center"
            aria-label="Ir al token"
            title="Buscar"
          >
            <ArrowRight size={12} className="opacity-90" aria-hidden />
          </button>
        </form>
        {withRecents && recents.length > 0 ? (
          <div className="mt-0.5 flex flex-wrap items-center gap-0.5 max-w-full">
            <span className="text-[6px] uppercase text-gray-600 shrink-0">R</span>
            {recents.slice(0, 3).map((mint) => {
              const ok = isProbableSolanaMint(mint);
              return (
                <button
                  key={mint}
                  type="button"
                  disabled={!ok}
                  onClick={() => {
                    if (!ok) return;
                    router.push(`/token/${encodeURIComponent(mint)}`);
                  }}
                  className="font-mono text-[6px] px-0.5 py-0 rounded border border-white/[0.08] bg-white/[0.03] text-gray-500 hover:text-white"
                >
                  {mint.slice(0, 3)}…{mint.slice(-2)}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="w-full min-w-0">
      <form onSubmit={onSearch} className="w-full flex items-center gap-1.5 sm:gap-2">
        <div className={`sl-input ${h} px-2.5 sm:px-3 flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0`}>
          <Search size={icon} className="text-gray-500 shrink-0" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={ph}
            autoComplete="off"
            spellCheck={false}
            className={inputCls}
          />
        </div>
        <button
          type="submit"
          className={`shrink-0 ${compact ? "btn-primary" : "btn-pro btn-pro-sm h-11 px-4"}`}
        >
          {withRecents ? "Ir" : "ANALYZE"}
        </button>
      </form>
      {withRecents && recents.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <span className="text-[8px] uppercase tracking-wider text-gray-500 shrink-0">Rec.</span>
          {recents.map((mint) => {
            const ok = isProbableSolanaMint(mint);
            return (
              <button
                key={mint}
                type="button"
                disabled={!ok}
                onClick={() => {
                  if (!ok) return;
                  router.push(`/token/${encodeURIComponent(mint)}`);
                }}
                className="font-mono text-[9px] px-1.5 py-0.5 rounded border border-white/[0.08] bg-white/[0.03] text-gray-400 hover:text-white hover:border-emerald-500/35 disabled:opacity-40"
              >
                {mint.slice(0, 4)}…{mint.slice(-4)}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
