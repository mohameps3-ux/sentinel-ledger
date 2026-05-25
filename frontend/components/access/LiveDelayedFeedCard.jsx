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
      className={`sl-shine-edge relative overflow-hidden rounded-xl border border-[rgba(96,165,250,0.35)] bg-gradient-to-r from-[rgba(37,99,235,0.12)] via-[rgba(37,99,235,0.06)] to-[rgba(37,99,235,0.02)] transition-all duration-300 ${
        entered ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"
      }`}
      style={{
        boxShadow:
          "0 0 0 1px rgba(96,165,250,0.12) inset, 0 12px 32px -16px rgba(37,99,235,0.45), 0 0 28px -8px rgba(37,99,235,0.18)"
      }}
      role="region"
      aria-labelledby="live-delayed-feed-card-title"
      aria-describedby="live-delayed-feed-card-body"
      data-testid="sl-live-feed-tier-badge"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-[var(--sl-sapphire-hi)] via-[var(--sl-diamond)] to-[var(--sl-sapphire-mid)]"
      />

      <h2 id="live-delayed-feed-card-title" className="sr-only">
        {t("war.live.delayedCard.title")}
      </h2>

      <button
        type="button"
        onClick={dismiss}
        className="absolute right-2 top-2 z-10 grid h-6 w-6 place-items-center rounded-md border border-transparent text-[var(--sl-text-muted)] transition-all hover:border-[var(--sl-border)] hover:bg-white/5 hover:text-[var(--sl-diamond)]"
        aria-label={t("war.live.delayedCard.dismissAria")}
      >
        <X className="h-3 w-3" strokeWidth={2.4} aria-hidden />
      </button>

      <div className="flex flex-col gap-2.5 px-4 py-3 pr-9 md:flex-row md:items-center md:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[rgba(96,165,250,0.4)] bg-[rgba(37,99,235,0.15)] text-[var(--sl-diamond)] shadow-[0_0_18px_rgba(37,99,235,0.35)]">
            <Clock className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="sl-eyebrow flex items-center gap-1.5 text-[var(--sl-sapphire-hi)]">
              <span className="sl-live-dot" />
              {t("war.live.delayedCard.title")}
            </div>
            <p
              id="live-delayed-feed-card-body"
              className="mt-0.5 text-[12.5px] leading-snug text-[var(--sl-text-secondary)] md:line-clamp-1"
            >
              {t("war.live.delayedCard.body")}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={openSubscriptionModal}
          className="sl-shine-edge group inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-lg border border-[rgba(96,165,250,0.6)] bg-gradient-to-br from-[rgba(37,99,235,0.25)] to-[rgba(29,78,216,0.18)] px-3.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--sl-diamond)] shadow-[0_0_0_1px_rgba(96,165,250,0.25)_inset,0_10px_24px_-10px_rgba(37,99,235,0.65)] transition-all hover:border-[rgba(147,197,253,0.85)] hover:from-[rgba(37,99,235,0.35)] hover:to-[rgba(29,78,216,0.25)] hover:text-[var(--sl-diamond-bright)] hover:shadow-[0_0_0_1px_rgba(147,197,253,0.45)_inset,0_16px_30px_-10px_rgba(37,99,235,0.85)] md:self-center"
        >
          <span className="sl-live-dot" style={{ width: "5px", height: "5px" }} />
          {t("war.live.delayedCard.cta")}
        </button>
      </div>
    </section>
  );
}
