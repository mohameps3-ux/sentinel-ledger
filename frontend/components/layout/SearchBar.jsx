import { useState } from "react";
import { Search } from "lucide-react";
import { useRouter } from "next/router";
import toast from "react-hot-toast";

export function SearchBar({ compact = false } = {}) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const onSearch = (e) => {
    e.preventDefault();
    const value = query.trim();
    if (value.length < 32 || value.length > 44) {
      toast.error("Paste a valid Solana mint (32-44 chars).");
      return;
    }
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
        Analyze
      </button>
    </form>
  );
}
