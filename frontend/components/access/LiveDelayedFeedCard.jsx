"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, X } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useLocale } from "../../contexts/LocaleContext";
import { useSubscriptionModal } from "../../contexts/SubscriptionModalContext";
import {
  persistDelayedCardDismissed,
  readDelayedCardDismissed,
  walletScopeKey
} from "../../lib/delayedFeedCardDismiss";

export function LiveDelayedFeedCard() {
  const { t } = useLocale();
  const { publicKey, connected } = useWallet();
  const { openSubscriptionModal } = useSubscriptionModal();
  const walletKey = walletScopeKey(connected && publicKey ? publicKey.toBase58() : null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(readDelayedCardDismissed(walletKey));
  }, [walletKey]);

  const dismiss = useCallback(() => {
    persistDelayedCardDismissed(walletKey);
    setDismissed(true);
  }, [walletKey]);

  if (dismissed) return null;

  return (
    <section
      className="relative overflow-hidden border border-amber-500/35 bg-gradient-to-br from-[#141008]/98 via-[#120e08]/98 to-[#0a0806]/98 shadow-[0_0_32px_rgba(245,158,11,0.08)]"
      role="region"
      aria-labelledby="live-delayed-feed-card-title"
      aria-describedby="live-delayed-feed-card-body"
      data-testid="sl-live-feed-tier-badge"
    >
      <span
        className="absolute inset-x-0 top-0 block h-px bg-gradient-to-r from-transparent via-amber-400/50 to-transparent"
        aria-hidden
      />
      <div className="p-3 sm:p-4">
        <header className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center border border-amber-500/40 bg-amber-500/10 text-amber-300"
              aria-hidden
            >
              <Clock className="h-4 w-4" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200/90">
                {t("war.live.delayedCard.badge")}
              </p>
              <h2
                id="live-delayed-feed-card-title"
                className="mt-1 text-sm sm:text-[15px] font-semibold text-sl-text leading-snug"
              >
                {t("war.live.delayedCard.title")}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="shrink-0 inline-flex h-8 w-8 items-center justify-center border border-white/10 bg-white/[0.03] text-sl-muted hover:text-sl-text hover:border-amber-500/35 transition-colors"
            aria-label={t("war.live.delayedCard.dismissAria")}
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        </header>
        <p
          id="live-delayed-feed-card-body"
          className="mt-3 text-[12px] sm:text-[13px] text-sl-sub leading-relaxed pl-12"
        >
          {t("war.live.delayedCard.body")}
        </p>
        <p className="mt-4 pl-12">
          <button
            type="button"
            onClick={openSubscriptionModal}
            className="inline-flex items-center justify-center border border-amber-400/45 bg-amber-500/15 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-amber-50 hover:bg-amber-500/25 hover:border-amber-300/55 transition-colors"
          >
            {t("war.live.delayedCard.cta")}
          </button>
        </p>
      </div>
    </section>
  );
}
