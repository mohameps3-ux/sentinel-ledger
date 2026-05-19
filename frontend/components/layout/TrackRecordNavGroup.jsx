"use client";

import Link from "next/link";
import { ProPurchaseButton } from "../subscription/ProPurchaseButton";

/** Sentinel for nav tuples that open the USDC modal instead of routing. */
export const TRACK_RECORD_NAV_OPEN_PRO = "__open_subscription__";

function rowClassName(active) {
  return `flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition ${
    active
      ? "bg-cyan-400/10 text-cyan-200 ring-1 ring-cyan-400/15"
      : "text-slate-300 hover:bg-slate-800/50 hover:text-white"
  }`;
}

/**
 * Sidebar nav group for the standalone Track Record page.
 * @param {{ title: string, items: Array<[string, string, string?]> }} props
 */
export function TrackRecordNavGroup({ title, items }) {
  return (
    <div>
      <div className="mb-3 px-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">{title}</div>
      <div className="space-y-1">
        {items.map(([label, href, active]) => {
          const className = rowClassName(active);
          const key = `${label}-${href}`;
          if (href === TRACK_RECORD_NAV_OPEN_PRO) {
            return (
              <ProPurchaseButton key={key} type="button" className={`w-full text-left ${className}`}>
                <span>{label}</span>
              </ProPurchaseButton>
            );
          }
          return (
            <Link key={key} href={href} className={className}>
              <span>{label}</span>
              {active ? (
                <span className="text-[10px] uppercase tracking-[0.14em] text-cyan-300">Oracle</span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
