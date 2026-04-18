import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { getPublicApiUrl } from "../../lib/publicRuntime";

const DISMISS_KEY = "sentinel-welcome-dismissed-at";
const TTL_MS = 24 * 60 * 60 * 1000;

export function WelcomeBanner() {
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [hasToken, setHasToken] = useState(false);
  const [stats, setStats] = useState({ signalsToday: "—", topWallet: "—", window: "—" });
  const [visible, setShow] = useState(false);

  const dismissed = useMemo(() => {
    if (typeof window === "undefined") return true;
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (!raw) return false;
      const t = Number(raw);
      if (!Number.isFinite(t)) return false;
      return Date.now() - t < TTL_MS;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    setHasToken(Boolean(typeof window !== "undefined" && localStorage.getItem("token")));
  }, []);

  useEffect(() => {
    if (connected || hasToken || dismissed) {
      setShow(false);
      return;
    }
    setShow(true);
  }, [connected, hasToken, dismissed]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${getPublicApiUrl()}/api/v1/public/stats`);
        const j = await res.json();
        if (cancelled || !j?.ok) return;
        setStats({
          signalsToday: j.signalsToday != null ? String(j.signalsToday) : "—",
          topWallet: j.topWalletPct30d != null ? `+${Number(j.topWalletPct30d).toFixed(1)}%` : "—",
          window: j.avgEntryWindowMins != null ? String(j.avgEntryWindowMins) : "—"
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch (_) {}
    setShow(false);
  }, []);

  const openWallet = useCallback(() => setVisible(true), [setVisible]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[60] sm:bottom-auto sm:top-[72px] sm:inset-x-auto sm:right-4 sm:left-auto max-w-lg p-3 pointer-events-none"
      role="dialog"
      aria-label="Welcome"
    >
      <div className="pointer-events-auto rounded-2xl border border-emerald-500/30 bg-[#0f1218]/95 backdrop-blur-md shadow-[0_0_40px_rgba(16,185,129,0.15)] p-5 text-left">
        <div className="flex justify-between gap-2">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-white leading-snug">
              The wallets that win most on Solana already moved. Want to know what they bought?
            </h2>
            <p className="text-sm text-gray-300 mt-2">
              Sentinel Ledger tracks high win-rate wallets in real time and shows what they buy and when to enter.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="shrink-0 h-9 w-9 rounded-lg border border-white/10 text-gray-400 hover:text-white inline-flex items-center justify-center"
            aria-label="Dismiss welcome"
          >
            <X size={16} />
          </button>
        </div>
        <ul className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono text-gray-200">
          <li className="rounded-lg bg-white/[0.04] px-3 py-2 border border-white/[0.06]">
            Signals today: <span className="text-emerald-300">{stats.signalsToday}</span>
          </li>
          <li className="rounded-lg bg-white/[0.04] px-3 py-2 border border-white/[0.06]">
            Top wallet (30d): <span className="text-emerald-300">{stats.topWallet}</span>
          </li>
          <li className="rounded-lg bg-white/[0.04] px-3 py-2 border border-white/[0.06]">
            Avg entry window: <span className="text-emerald-300">{stats.window} min</span>
          </li>
        </ul>
        <div className="mt-4 flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={openWallet}
            className="btn-pro w-full sm:w-auto inline-flex justify-center items-center gap-2"
            aria-label="Connect Phantom wallet"
          >
            Connect Phantom and see signals →
          </button>
          <Link
            href="/results"
            className="text-center text-sm text-gray-400 hover:text-white underline-offset-2 hover:underline py-2"
          >
            View results without connecting →
          </Link>
        </div>
      </div>
    </div>
  );
}
