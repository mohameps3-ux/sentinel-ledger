/**
 * Iridescent gold score number — used for the most prestigious
 * scalar on a screen (Sentinel score, conviction, etc.).
 *
 * Renders the value with an animated conic-gradient clipped to the
 * text shape: gold → copper → silver → gold, rotating once every 7s.
 * The "opal pulido" effect the user asked for, achieved in pure CSS.
 *
 * Props:
 *   value    string | number — the number to display
 *   label    optional uppercase mono caption shown above
 *   suffix   optional trailing glyph (e.g., "%", "/100")
 *   size     "sm" | "md" | "lg" | "xl"  (default "lg")
 *   align    "center" | "start" | "end"  (default "center")
 *
 * Falls back to solid gold in browsers that lack background-clip:text.
 */
const SIZE_TO_CLASS = {
  sm: "text-2xl",
  md: "text-3xl",
  lg: "text-5xl",
  xl: "text-6xl"
};

const ALIGN_TO_CLASS = {
  start: "items-start text-left",
  center: "items-center text-center",
  end: "items-end text-right"
};

export function IridescentScore({
  value,
  label,
  suffix,
  size = "lg",
  align = "center",
  className = ""
}) {
  const sizeClass = SIZE_TO_CLASS[size] || SIZE_TO_CLASS.lg;
  const alignClass = ALIGN_TO_CLASS[align] || ALIGN_TO_CLASS.center;
  const display = value === undefined || value === null || value === "" ? "—" : value;

  return (
    <div className={`flex flex-col ${alignClass} ${className}`.trim()}>
      {label ? (
        <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#737373]">
          {label}
        </span>
      ) : null}
      <span className={`apex-iridescent font-mono font-black leading-none ${sizeClass}`}>
        {display}
        {suffix ? <span className="ml-0.5 text-[0.45em] align-super">{suffix}</span> : null}
      </span>
    </div>
  );
}
