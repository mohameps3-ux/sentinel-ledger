import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { HealthBar } from "./HealthBar";
import { APP_NAV_LINKS } from "./appNavConfig";
import { ProPurchaseButton } from "../subscription/ProPurchaseButton";
import { useSubscriptionStatus } from "../../hooks/useSubscriptionStatus";

const rowBase = "block w-full text-left text-[13px] rounded-md px-2.5 py-1.5 transition-colors";

/**
 * "Más" — dropdown with plan status + the same nav links that used to sit inline on the bar.
 * Used on the home page to keep the header to search + wallet + this control.
 */
export function NavAppMenu({ router, stalkerUnread, onStalkerNavigate }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const p = router.pathname || "";
  const { active: walletSubActive } = useSubscriptionStatus();

  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [p]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className="whitespace-nowrap text-[11px] sm:text-xs text-sl-sub hover:text-sl-text font-medium flex items-center gap-1 rounded-md pl-2 pr-1.5 py-1.5 border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.07] transition-colors"
      >
        Más
        <ChevronDown size={14} className={`shrink-0 text-sl-sub transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-60 max-h-[min(80dvh,26rem)] overflow-y-auto z-[100] border border-sl-border bg-[#0a0c0f] shadow-2xl shadow-black/50 py-2"
        >
          <div className="px-3 py-1.5 border-b border-white/[0.08] text-[9px] text-sl-muted uppercase tracking-wider font-semibold">
            Cuenta
          </div>
          <div className="px-3 py-2 border-b border-white/[0.08]">
            <HealthBar />
          </div>
          <div className="px-2 pt-1.5 pb-1 text-[9px] text-sl-muted uppercase tracking-wider">App</div>
          <div className="flex flex-col gap-0.5 px-1.5">
            {APP_NAV_LINKS.map((item) => {
              const active = item.openSubscription ? false : p === item.href;
              // Hide "Go PRO" when wallet subscription is already active
              if (item.openSubscription && walletSubActive) return null;
              if (item.isStalker) {
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={onStalkerNavigate}
                    className={`${rowBase} text-sl-sub hover:bg-white/[0.05] hover:text-sl-text inline-flex items-center gap-1 no-underline`}
                    role="menuitem"
                  >
                    {item.label}
                    {stalkerUnread > 0 ? (
                      <span className="inline-flex min-w-[16px] h-4 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-[9px] items-center justify-center px-0.5">
                        {Math.min(stalkerUnread, 99)}
                      </span>
                    ) : null}
                  </Link>
                );
              }
              if (item.openSubscription) {
                return (
                  <ProPurchaseButton
                    key={item.key}
                    onClick={() => setOpen(false)}
                    className={`${rowBase} text-sl-sub hover:bg-white/[0.05] hover:text-sl-text inline-flex items-center flex-wrap gap-x-1`}
                    role="menuitem"
                  >
                    {item.label}
                    <span className="text-[7px] font-bold uppercase tracking-widest text-sl-muted border border-sl-border rounded px-0.5">
                      pro
                    </span>
                  </ProPurchaseButton>
                );
              }
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`${rowBase} no-underline ${
                    active
                      ? "text-sl-text font-semibold bg-white/[0.08] border border-sl-border"
                      : "text-sl-sub hover:bg-white/[0.05] hover:text-sl-text"
                  } inline-flex items-center flex-wrap gap-x-1`}
                  aria-current={active ? "page" : undefined}
                  role="menuitem"
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
