import { useState } from "react";
import { useRouter } from "next/router";
import { PageHead } from "../components/seo/PageHead";

export default function OpsLoginPage() {
  const router = useRouter();
  const [keyValue, setKeyValue] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = keyValue.trim();
    if (!trimmed) {
      setError("OPS key required");
      return;
    }

    try {
      localStorage.setItem("sentinel-ops-key", trimmed);
      document.cookie = `sentinel_ops_gate=${encodeURIComponent(trimmed)}; path=/; max-age=${60 * 60 * 8}; SameSite=Lax`;
      router.push("/ops");
    } catch {
      setError("Unable to store access key");
    }
  };

  return (
    <>
      <PageHead title="OPS Access — Sentinel" description="Institutional operations access" />
      <div className="min-h-screen bg-[#030712] text-slate-100 flex items-center justify-center px-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#07111a]/95 p-8 shadow-[0_0_80px_rgba(8,145,178,.08)] backdrop-blur-xl">
          <div className="mb-8">
            <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-400 font-bold">Sentinel Internal</div>
            <h1 className="mt-3 text-3xl font-black tracking-tight">OPS ACCESS</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Operational clearance required to access the Sentinel institutional control terminal.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-2 block text-[11px] uppercase tracking-[0.16em] text-slate-500">
                OPS KEY
              </label>
              <input
                type="password"
                value={keyValue}
                onChange={(e) => setKeyValue(e.target.value)}
                placeholder="Enter operational access key"
                className="w-full rounded-xl border border-slate-700 bg-[#030712] px-4 py-4 font-mono text-sm text-cyan-100 outline-none transition focus:border-cyan-400/60"
              />
            </div>

            {error ? (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              className="w-full rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-4 text-sm font-bold uppercase tracking-[0.18em] text-cyan-200 transition hover:bg-cyan-400/15"
            >
              Unlock OPS Terminal
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
