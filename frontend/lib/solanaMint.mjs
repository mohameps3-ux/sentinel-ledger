/**
 * Client-side Solana address sanity check (aligned with backend isProbableSolanaPubkey).
 * Used before navigation or API calls so we never route to fake placeholder mints.
 *
 * `.mjs` so Node can load the module graph for desk-radar tests without package.json type.
 */
export function isProbableSolanaMint(value) {
  if (typeof value !== "string") return false;
  const s = value.trim();
  if (s.length < 32 || s.length > 44) return false;
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(s);
}
