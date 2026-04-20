import { useTerminalMemoryEntry } from "../../hooks/useTerminalMemoryEntry";

/**
 * Transparent wrapper that applies a "watched" tint to a home-feed card
 * when the user has pinned its mint in Terminal Memory.
 *
 * Why a wrapper component and not an inline hook?
 * -----------------------------------------------
 * The home grids render each card inside `.map()` over `interpretedSignals`
 * / `visibleTrending`. Rules of Hooks forbid calling a hook inside a loop,
 * so the natural spot — "just read `useTerminalMemoryEntry(mint)` at the
 * top of each iteration" — isn't legal. Extracting the whole card into a
 * named component would be a much larger, riskier refactor (props
 * explosion, more surface for regressions).
 *
 * Wrapping *only the outer `<div>`* of each card keeps the refactor
 * surgical:
 *   - all existing content stays inline in the `.map()`,
 *   - the subscription is localised to a tiny component,
 *   - React.memo isn't needed because re-renders here are rare
 *     (pin toggle is the dominant trigger, once per user click).
 *
 * The `mint` prop may be falsy (skeleton cards); in that case the hook
 * short-circuits inside the store (invalid mint) and no tint is applied.
 */
export function WatchedCardShell({ mint, baseClassName = "", watchedClassName = "", ...rest }) {
  const entry = useTerminalMemoryEntry(mint);
  const watched = entry?.isWatched === true;
  const cls = watched
    ? `${baseClassName} ${watchedClassName}`.trim()
    : baseClassName;
  return <div data-watched={watched ? "1" : undefined} className={cls} {...rest} />;
}
