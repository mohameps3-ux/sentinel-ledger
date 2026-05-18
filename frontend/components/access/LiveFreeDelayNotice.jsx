"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Zap } from "lucide-react";
import { useLocale } from "../../contexts/LocaleContext";
import { useSubscriptionModal } from "../../contexts/SubscriptionModalContext";

const DISMISS_KEY = "sl_live_free_delay_notice_dismissed";
const DELAY_MINUTES = 15;

function readDismissed() {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function persistDismissed() {
  try {
    sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* private mode / quota */
  }
}

export function LiveFreeDelayNotice() {
  const { t } = useLocale();
  const { openSubscriptionModal } = useSubscriptionModal();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!readDismissed()) setVisible(true);
  }, []);

  const dismiss = useCallback(() => {
    persistDismissed();
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <section
      className="w-full shrink-0"
      role="dialog"
      aria-labelledby="live-free-delay-notice-title"
      aria-describedby="live-free-delay-notice-body"
    >
      <section className="relative overflow-hidden border border-cyan-500/35 bg-gradient-to-br from-[#061018]/98 via-[#0a121c]/98 to-[#050b12]/98 backdrop-blur-md shadow-[0_0_40px_rgba(34,211,238,0.12),0_16px_48px_rgba(0,0,0,0.55)]">
        <span
          className="absolute inset-x-0 top-0 block h-px bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent"
          aria-hidden
        />
        <section className="p-4 sm:p-5">
          <header className="flex items-start justify-between gap-3">
            <section className="flex items-start gap-3 min-w-0">
              <span
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center border border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
                aria-hidden
              >
                <Zap className="h-4 w-4" strokeWidth={2.25} />
              </span>
              <section className="min-w-0">
                <h2
                  id="live-free-delay-notice-title"
                  className="text-sm sm:text-base font-semibold text-sl-text leading-snug"
                >
                  {t("war.live.notice.title")}
                </h2>
              </section>
            </section>
            <button
              type="button"
              onClick={dismiss}
              className="shrink-0 inline-flex h-8 w-8 items-center justify-center border border-white/10 bg-white/[0.03] text-sl-muted hover:text-sl-text hover:border-cyan-500/35 transition-colors"
              aria-label={t("war.live.notice.dismissAria")}
            >
              <X className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          </header>
          <p id="live-free-delay-notice-body" className="mt-3 text-[12px] sm:text-[13px] text-sl-sub leading-relaxed pl-12">
            {t("war.live.notice.body", { minutes: DELAY_MINUTES })}
          </p>
          <p className="mt-4 pl-12">
            <button
              type="button"
              onClick={openSubscriptionModal}
              className="inline-flex items-center justify-center border border-cyan-400/45 bg-cyan-500/15 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-100 hover:bg-cyan-500/25 hover:border-cyan-300/55 transition-colors"
            >
              {t("war.live.notice.cta")}
            </button>
          </p>
        </section>
      </section>
    </section>
  );
}
