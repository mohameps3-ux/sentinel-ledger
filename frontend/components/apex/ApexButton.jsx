/**
 * Hardware-style buttons for high-stakes actions.
 *
 * Variants:
 *   "primary"    — convex iridescent gold metal. Use for the SINGLE
 *                  most important action on the screen.
 *   "secondary"  — pearl silver with gold text. Sits next to primary.
 *
 * Sizes (primary):
 *   "sm" 30px · "md" (default) 38px · "lg" 48px
 *
 * Renders as <button> by default; pass `as="a"` to render as an anchor
 * for links that look like a button (e.g., external trade routes).
 *
 * The visual contract is fully defined in styles/apex-obsidian.css:
 *   - Convex via stacked linear-gradients + inset shadows.
 *   - Hover sweeps an iridescent highlight (oil-on-water) across the
 *     surface from right to left over 800ms.
 *   - Active state micro-presses with an inner shadow (real metal feel).
 */
export function ApexButton({
  variant = "primary",
  size = "md",
  as: Tag = "button",
  className = "",
  children,
  ...rest
}) {
  const base = variant === "secondary" ? "apex-btn-secondary" : "apex-btn";
  const sizeClass =
    variant === "primary" && size === "sm"
      ? "apex-btn-sm"
      : variant === "primary" && size === "lg"
        ? "apex-btn-lg"
        : "";
  const cls = [base, sizeClass, className].filter(Boolean).join(" ");

  if (Tag === "button" && rest.type === undefined) {
    rest.type = "button";
  }

  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  );
}
