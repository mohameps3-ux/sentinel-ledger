"use client";

import { PageHead } from "../seo/PageHead";

/**
 * Thin shell for the Track Record page.
 * The previous duplicated sidebar was removed — the global Navbar (rendered in _app.jsx)
 * already provides full navigation, so the page should be full-width and clean.
 */
export function TrackRecordShell({ children }) {
  return (
    <div className="min-h-screen bg-[var(--sl-bg-base)] text-[var(--sl-text-primary)]">
      <PageHead
        title="Track Record — Sentinel Ledger"
        description="Institutional Sentinel validation terminal."
      />
      <main>{children}</main>
    </div>
  );
}
