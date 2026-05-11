import { useState } from "react";
import { resolveTokenImageUrl } from "../../lib/resolveTokenImageUrl";

const VARIANT_FRAME = {
  live: "border-emerald-500/25 ring-1 ring-emerald-500/10 shadow-[0_0_12px_rgba(16,185,129,0.06)]",
  heat: "border-amber-500/30 ring-1 ring-amber-500/15 shadow-[0_0_12px_rgba(245,158,11,0.08)]",
  hot: "border-orange-500/30 ring-1 ring-orange-500/12 shadow-[0_0_12px_rgba(249,115,22,0.06)]",
  neutral: "border-white/[0.12] ring-1 ring-white/[0.06]"
};

/**
 * Compact token logo for tactical cards — circular, does not shift surrounding typography when missing.
 */
export function TokenCardAvatar({ tokenLike, mint, size = 30, variant = "neutral", className = "" }) {
  const url = resolveTokenImageUrl(tokenLike);
  const [broken, setBroken] = useState(false);
  const dim = Math.max(22, Math.min(44, Number(size) || 30));
  const frame = VARIANT_FRAME[variant] || VARIANT_FRAME.neutral;
  const base = `shrink-0 rounded-full object-cover bg-white/[0.03] ${frame} ${className}`.trim();

  if (!url || broken) {
    return (
      <div
        className={base}
        style={{ width: dim, height: dim }}
        aria-hidden
      />
    );
  }

  return (
    <img
      src={url}
      alt=""
      width={dim}
      height={dim}
      className={base}
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
    />
  );
}
