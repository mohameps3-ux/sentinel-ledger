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
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    setDismissed(readDelayedCardDismissed(walletKey));
  }, [walletKey]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const dismiss = useCallback(() => {
    persistDelayedCardDismissed(walletKey);
    setDismissed(true);
  }, [walletKey]);

  if (dismissed) return null;

  return (
    <section
      className={`relative max-h-[60px] overflow-hidden border border-white/10 bg-zinc-900/90 transition-opacity duration-200 ${
        entered ? "opacity-100" : "opacity-0"
      }`}
      role="region"
      aria-labelledby="live-delayed-feed-card-title"
      aria-describedby="live-delayed-feed-card-body"
      data-testid="sl-live-feed-tier-badge"
    >
      <h2 id="live-delayed-feed-card-title" className="sr-only">
        {t("war.live.delayedCard.title")}
      </h2>

      <button
        type="button"
        onClick={dismiss}
        className="absolute top-1.5 right-1.5 z-10 inline-flex h-5 w-5 items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors"
        aria-label={t("war.live.delayedCard.dismissAria")}
      >
        <X className="h-3 w-3" strokeWidth={2} aria-hidden />
      </button>

      <div className="flex max-h-[60px] flex-col gap-1 px-2.5 py-2 pr-7 md:flex-row md:items-center md:gap-2.5 md:py-1.5">
        <div className="flex min-w-0 flex-1 items-start gap-2 md:items-center">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400 md:mt-0" strokeWidth={2} aria-hidden />
          <p
            id="live-delayed-feed-card-body"
            className="min-w-0 flex-1 text-sm leading-snug text-zinc-300 line-clamp-2 md:line-clamp-1"
          >
            {t("war.live.delayedCard.body")}
          </p>
        </div>

        <button
          type="button"
          onClick={openSubscriptionModal}
          className="inline-flex h-7 shrink-0 items-center self-start border border-zinc-600 px-2.5 text-xs font-medium text-zinc-200 transition-colors hover:border-zinc-500 hover:text-zinc-100 md:self-center md:ml-0 ml-6"
        >
          {t("war.live.delayedCard.cta")}
        </button>
      </div>
    </section>
  );
}
