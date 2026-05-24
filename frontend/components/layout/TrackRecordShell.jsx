"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Menu, X } from "lucide-react";
import { PageHead } from "../seo/PageHead";
import { TrackRecordNavGroup, TRACK_RECORD_NAV_OPEN_PRO } from "./TrackRecordNavGroup";

const NAV_MAIN = [
  ["Home", "/"],
  ["Scanner", "/scanner"],
  ["Smart Money", "/smart-money"],
  ["Watchlist", "/watchlist"],
  ["Alerts", "/alerts"],
  ["Pricing", TRACK_RECORD_NAV_OPEN_PRO],
  ["Compare", "/compare"],
  ["Portfolio", "/portfolio"]
];

const NAV_INTEL = [
  ["Track Record", "/track-record", "active"],
  ["Alpha Radar", "/scanner"]
];

const NAV_SYSTEM = [
  ["Settings", "/settings"],
  ["Docs", "/docs"]
];

function SidebarNav() {
  return (
    <>
      <TrackRecordNavGroup title="MAIN" items={NAV_MAIN} />
      <TrackRecordNavGroup title="INTELLIGENCE" items={NAV_INTEL} />
      <TrackRecordNavGroup title="SYSTEM" items={NAV_SYSTEM} />
    </>
  );
}

export function TrackRecordShell({ children }) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [router.pathname]);

  return (
    <div className="min-h-screen bg-[#030712] text-slate-100">
      <PageHead
        title="Track Record — Sentinel Ledger"
        description="Institutional Sentinel validation terminal."
      />

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[276px] border-r border-slate-800/80 bg-[#050b12]/95 backdrop-blur-xl xl:block">
        <div className="flex h-20 items-center gap-3 border-b border-slate-800/70 px-7">
          <div className="grid h-10 w-10 place-items-center rounded-full border border-cyan-400/40 bg-cyan-400/5 text-cyan-300">
            ◎
          </div>
          <div className="leading-tight">
            <div className="text-sm font-black tracking-[0.22em]">SENTINEL</div>
            <div className="text-sm font-black tracking-[0.22em]">LEDGER</div>
          </div>
        </div>
        <div className="space-y-7 px-5 py-6">
          <SidebarNav />
        </div>
        <div className="absolute bottom-0 left-0 right-0 border-t border-slate-800/70 p-6">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">System Status</div>
          <div className="mt-3 text-2xl font-black text-emerald-300">LIVE</div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
            <span>All systems operational</span>
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
          </div>
        </div>
      </aside>

      <div className="xl:hidden sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-slate-800/80 bg-[#050b12]/95 px-4 py-3 backdrop-blur-xl">
        <span className="text-sm font-black tracking-[0.18em] text-slate-200">SENTINEL LEDGER</span>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-700 bg-slate-800/60 text-slate-200"
          aria-expanded={drawerOpen}
          aria-label="Open navigation"
        >
          <Menu size={18} />
        </button>
      </div>

      {drawerOpen ? (
        <>
          <div
            className="fixed inset-0 z-[210] bg-black/60 backdrop-blur-[1px] xl:hidden"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <div className="fixed inset-y-0 left-0 z-[220] flex w-[min(300px,88vw)] flex-col border-r border-slate-800/80 bg-[#050b12]/98 backdrop-blur-xl xl:hidden">
            <div className="flex items-center justify-between border-b border-slate-800/70 px-5 py-4">
              <span className="text-xs font-black tracking-[0.2em] text-slate-300">NAVIGATION</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-700 text-slate-300"
                aria-label="Close navigation"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 space-y-7 overflow-y-auto px-5 py-6">
              <SidebarNav />
            </div>
          </div>
        </>
      ) : null}

      <main className="xl:pl-[276px]">{children}</main>
    </div>
  );
}
