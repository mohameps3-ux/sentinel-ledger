import { useState } from "react";
import { Search } from "lucide-react";
import { useRouter } from "next/router";
import toast from "react-hot-toast";

export function SearchBar() {
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

  return (
    <form onSubmit={onSearch} className="w-full flex items-center gap-2">
      <div className="sl-input h-11 px-3 flex items-center gap-2 flex-1 min-w-0">
        <Search size={16} className="text-gray-500 shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search mint..."
          autoComplete="off"
          spellCheck={false}
          className="bg-transparent border-none outline-none w-full text-sm text-gray-100 placeholder:text-gray-500"
        />
      </div>
      <button type="submit" className="btn-pro btn-pro-sm h-11 px-4 shrink-0">
        Analyze
      </button>
    </form>
  );
}
