import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHead } from "../components/seo/PageHead";

export default function OpsKeyPage() {
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      setKey(localStorage.getItem("sentinel-ops-key") || "");
    } catch {}
  }, []);

  const save = () => {
    try {
      const trimmed = key.trim();
      localStorage.setItem("sentinel-ops-key", trimmed);
      document.cookie = `sentinel_ops_gate=${encodeURIComponent(trimmed)}; path=/; max-age=${60 * 60 * 8}; SameSite=Lax`;
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
  };

  const clear = () => {
    try {
      localStorage.removeItem("sentinel-ops-key");
      document.cookie = "sentinel_ops_gate=; path=/; max-age=0; SameSite=Lax";
      setKey("");
      setSaved(false);
    } catch {}
  };

  return (
    <>
      <PageHead title="Ops Key — Sentinel Ledger" description="Unlock Sentinel ops console." />
      <main className="mx-auto flex min-h-screen max-w-3xl items-center px-5 py-10 font-mono text-slate-100">
        <section className="w-full rounded-2xl border border-cyan-400/15 bg-[#05070a] p-6 shadow-[0_0_80px_rgba(6,182,212,.06)]">
          <div className="text-[11px] uppercase tracking-[0.26em] text-cyan-400">Sentinel Ops Gate</div>
          <h1 className="mt-3 text-3xl font-black">Enter OPS Key</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            This stores your key only in this browser as <span className="text-slate-200">sentinel-ops-key</span>. It is sent as <span className="text-slate-200">x-ops-key</span> through the Vercel bridge to Railway.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              type="password"
              placeholder="Paste OMNI_BOT_OPS_KEY here"
              className="min-h-12 flex-1 rounded-xl border border-slate-700 bg-black px-4 text-sm text-slate-100 outline-none focus:border-cyan-400/60"
            />
            <button onClick={save} className="rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-5 py-3 text-sm font-bold text-cyan-100">
              Save Key
            </button>
          </div>
          {saved ? <p className="mt-3 text-sm text-emerald-300">Saved. Now open Ops.</p> : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/ops" className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-5 py-3 text-sm font-bold text-emerald-100 no-underline">
              Open /ops
            </Link>
            <Link href="/ops-live" className="rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-5 py-3 text-sm font-bold text-cyan-100 no-underline">
              Open /ops-live
            </Link>
            <button onClick={clear} className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-bold text-slate-300">
              Clear
            </button>
          </div>
        </section>
      </main>
    </>
  );
}
