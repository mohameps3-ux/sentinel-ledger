import Link from "next/link";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useUserStatus } from "../../hooks/useUserStatus";
import { getPublicApiUrl } from "../../lib/publicRuntime";
import { useClientAuthToken } from "../../hooks/useClientAuthToken";

function formatDateShort(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function HealthBar() {
  const { loading, plan, status, expiresAt, isLifetime, hasProAccess } = useUserStatus();
  const token = useClientAuthToken();
  const [portalLoading, setPortalLoading] = useState(false);

  const label = useMemo(() => {
    if (loading) return null;
    if (!hasProAccess && plan === "free") return "free";
    if (!hasProAccess && status === "expired") return "expired";
    if (hasProAccess && isLifetime) return "lifetime";
    if (hasProAccess) return "paid";
    return "free";
  }, [loading, hasProAccess, plan, status, isLifetime]);

  const openPortal = async () => {
    if (!token) {
      toast.error("Connect wallet first.");
      return;
    }
    try {
      setPortalLoading(true);
      const res = await fetch(`${getPublicApiUrl()}/api/v1/create-portal-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        }
      });
      const json = await res.json();
      if (!res.ok || !json?.ok || !json?.url) throw new Error(json?.error || "portal_failed");
      window.location.href = json.url;
    } catch (e) {
      toast.error(e.message || "Could not open billing portal.");
    } finally {
      setPortalLoading(false);
    }
  };

  if (loading) {
    return <div className="text-[11px] text-gray-500">Checking plan…</div>;
  }

  if (label === "lifetime") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="px-2 py-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-200">
          Lifetime PRO
        </span>
        <button
          type="button"
          onClick={openPortal}
          disabled={portalLoading}
          className="text-purple-300 hover:text-purple-200 disabled:opacity-50"
        >
          {portalLoading ? "…" : "Manage"}
        </button>
      </div>
    );
  }

  if (label === "expired") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="px-2 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-200">
          PRO expired
        </span>
        <Link href="/pricing" className="text-purple-300 hover:text-purple-200">
          Renew
        </Link>
      </div>
    );
  }

  if (label === "paid") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-[11px] max-w-[min(100%,20rem)]">
        <span className="px-2 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 shrink-0">
          {String(plan || "pro").toUpperCase()}
        </span>
        <span className="text-gray-300 truncate">
          {expiresAt ? `until ${formatDateShort(expiresAt)}` : "active"}
        </span>
        <button
          type="button"
          onClick={openPortal}
          disabled={portalLoading}
          className="text-purple-300 hover:text-purple-200 shrink-0 disabled:opacity-50"
        >
          {portalLoading ? "…" : "Manage"}
        </button>
        <Link href="/pricing" className="text-gray-400 hover:text-white shrink-0">
          Upgrade
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="px-2 py-1 rounded-full border border-white/10 bg-white/5 text-gray-300">Free</span>
      <Link href="/pricing" className="text-purple-300 hover:text-purple-200">
        Upgrade to PRO
      </Link>
    </div>
  );
}
