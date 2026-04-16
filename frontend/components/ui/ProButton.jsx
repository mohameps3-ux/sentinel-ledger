/**
 * Primary / secondary actions — shared gradient + radius (design system).
 */
export function ProButton({ children, variant = "primary", className = "", type = "button", ...props }) {
  const base =
    variant === "primary"
      ? "btn-pro"
      : variant === "ghost"
        ? "btn-ghost"
        : "btn-pro-outline";
  return (
    <button type={type} className={`${base} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}
