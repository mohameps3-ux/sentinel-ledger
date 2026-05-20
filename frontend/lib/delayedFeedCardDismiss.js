export const DELAYED_CARD_DISMISS_KEY = "sl.delayed-card-dismissed";

export function walletScopeKey(publicKey) {
  return publicKey ? String(publicKey) : "__guest__";
}

export function readDelayedCardDismissed(walletKey) {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(DELAYED_CARD_DISMISS_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return parsed?.dismissed === true && parsed?.wallet === walletKey;
  } catch {
    return false;
  }
}

export function persistDelayedCardDismissed(walletKey) {
  try {
    localStorage.setItem(
      DELAYED_CARD_DISMISS_KEY,
      JSON.stringify({ wallet: walletKey, dismissed: true })
    );
  } catch {
    /* quota / private mode */
  }
}
