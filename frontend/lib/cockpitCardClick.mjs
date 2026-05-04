/**
 * Desk selection: ignore clicks that should stay with nested controls (not the whole card).
 * Avoid `closest("details")` — it matches any node inside a disclosure and blocks the desk
 * for most of the card including the primary narrative/score areas when structure wraps content.
 */
export function cockpitCardClickTargetIsInteractive(e) {
  const raw = e?.target;
  const el = raw instanceof Element ? raw : raw?.parentElement;
  if (!el || typeof el.closest !== "function") return false;
  return Boolean(
    el.closest("a[href], button, summary, label, input, select, textarea, [role='button']")
  );
}
