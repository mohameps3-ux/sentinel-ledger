import Link from "next/link";
import { useMemo } from "react";
import { useUserStatus } from "../../hooks/useUserStatus";

function formatRemaining(expiresAt) {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "Expired";
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 24) return `${hours}h left`;
  const days = Math.floor(hours / 24);
  return `${days}d left`;
}

export function HealthBar() {
  const { loading, plan, expiresAt, isPro } = useUserStatus();
  const remaining = useMemo(() => formatRemaining(expiresAt), [expiresAt]);

  if (loading) {
    return <div className="text-[11px] text-gray-500">Checking plan…</div>;
  }

  if (!isPro) {
    return (
      <div className="flex items-center gap-2 text-[11px]">
        <span className="px-2 py-1 rounded-full border border-white/10 bg-white/5 text-gray-300">Free</span>
        <Link href="/pricing" className="text-purple-300 hover:text-purple-200">
          Upgrade to PRO
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="px-2 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
        {String(plan || "pro").toUpperCase()}
      </span>
      <span className="text-gray-300">{remaining || "Active"}</span>
      <Link href="/pricing" className="text-purple-300 hover:text-purple-200">
        Upgrade
      </Link>
    </div>
  );
}
