import { useState, useEffect, useCallback } from "react";
import { Search } from "lucide-react";
import { useRouter } from "next/router";
import toast from "react-hot-toast";
import { isProbableSolanaMint } from "../../lib/solanaMint";

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
 */
export function SearchBar({ compact = false, withRecents = false } = {}) {
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

  const h = compact ? "h-9" : "h-11";
  const icon = compact ? 14 : 16;
  const ph = compact ? "Mint (32–44 chars)…" : "Paste Solana token address...";
  const inputCls = compact
    ? "bg-transparent border-none outline-none w-full text-xs sm:text-sm text-gray-100 placeholder:text-gray-500"
    : "bg-transparent border-none outline-none w-full text-sm text-gray-100 placeholder:text-gray-500";

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
          className={`btn-pro btn-pro-sm shrink-0 ${compact ? "h-9 px-3 text-xs" : "h-11 px-4"}`}
        >
          {withRecents ? "Ir" : "Analyze"}
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
