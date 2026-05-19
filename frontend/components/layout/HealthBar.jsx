import { useMemo } from "react";
import { useUserStatus } from "../../hooks/useUserStatus";
import { useSubscriptionStatus } from "../../hooks/useSubscriptionStatus";
import { ProPurchaseButton } from "../subscription/ProPurchaseButton";

function formatDateShort(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * @param {object} [props]
 * @param {boolean} [props.onlyBadge] — plan status only (no upgrade links); for compact header
 */
export function HealthBar({ onlyBadge = false }) {
  const { loading: jwtLoading, plan: jwtPlan, status: jwtStatus, expiresAt: jwtExpiresAt, isLifetime, hasProAccess: jwtHasProAccess } = useUserStatus();
  const walletSub = useSubscriptionStatus();

  // Wallet USDC subscription takes precedence over JWT (no JWT for wallet-only subscribers)
  const hasProAccess = jwtHasProAccess || walletSub.active;
  const plan = walletSub.active ? (walletSub.plan || "trial") : jwtPlan;
  const expiresAt = walletSub.active ? walletSub.expiresAt : jwtExpiresAt;
  const status = walletSub.active ? "active" : jwtStatus;
  const loading = jwtLoading || walletSub.isLoading;

  const label = useMemo(() => {
    if (loading) return null;
    if (!hasProAccess && plan === "free") return "free";
    if (!hasProAccess && status === "expired") return "expired";
    if (hasProAccess && isLifetime) return "lifetime";
    if (hasProAccess) return "paid";
    return "free";
  }, [loading, hasProAccess, plan, status, isLifetime]);

  const badgeClass = "text-[10px] sm:text-[11px] px-2 py-0.5 sm:py-1 rounded-full border";

  if (loading) {
    if (onlyBadge) {
      return <span className={`${badgeClass} border-sl-border bg-white/5 text-sl-muted`}>…</span>;
    }
    return <div className="text-[11px] text-sl-muted">Checking plan…</div>;
  }

  if (label === "lifetime") {
    if (onlyBadge) {
      return (
        <span className={`${badgeClass} border-cyan-500/30 bg-cyan-500/10 text-cyan-200`}>
          Lifetime PRO
        </span>
      );
    }
    return (
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="px-2 py-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-200">
          Lifetime PRO
        </span>
      </div>
    );
  }

  if (label === "expired") {
    if (onlyBadge) {
      return (
        <span className={`${badgeClass} border-blue-500/30 bg-blue-500/10 text-blue-200`}>
          PRO expired
        </span>
      );
    }
    return (
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="px-2 py-1 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-200">
          PRO expired
        </span>
        <ProPurchaseButton className="text-purple-300 hover:text-purple-200">Renew</ProPurchaseButton>
      </div>
    );
  }

  if (label === "paid") {
    if (onlyBadge) {
      return (
        <span
          className={`${badgeClass} border-emerald-500/30 bg-emerald-500/10 text-emerald-300 max-w-[9rem] sm:max-w-none truncate inline-block align-middle`}
          title={expiresAt ? `Until ${formatDateShort(expiresAt)}` : "Active"}
        >
          {String(plan || "pro").toUpperCase()}
          {expiresAt ? ` · ${formatDateShort(expiresAt)}` : ""}
        </span>
      );
    }
    return (
      <div className="flex flex-wrap items-center gap-2 text-[11px] max-w-[min(100%,20rem)]">
        <span className="px-2 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 shrink-0">
          {String(plan || "pro").toUpperCase()}
        </span>
        <span className="text-sl-sub truncate">
          {expiresAt ? `until ${formatDateShort(expiresAt)}` : "active"}
        </span>
        <ProPurchaseButton className="text-sl-sub hover:text-sl-text shrink-0">Upgrade</ProPurchaseButton>
      </div>
    );
  }

  if (onlyBadge) {
    return <span className={`${badgeClass} border-sl-border bg-white/5 text-sl-sub`}>Free</span>;
  }

  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="px-2 py-1 rounded-full border border-sl-border bg-white/5 text-sl-sub">Free</span>
      <ProPurchaseButton className="text-purple-300 hover:text-purple-200">Upgrade to PRO</ProPurchaseButton>
    </div>
  );
}
