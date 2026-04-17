import { motion, useSpring, useTransform } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

export function AnimatedNumber({ value, prefix = "", suffix = "", decimalPlaces = 2, className = "" }) {
  const numeric = useMemo(() => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }, [value]);
  const spring = useSpring(numeric, { stiffness: 100, damping: 20 });
  const [isGlowing, setIsGlowing] = useState(false);

  useEffect(() => {
    spring.set(numeric);
    setIsGlowing(true);
    const t = setTimeout(() => setIsGlowing(false), 300);
    return () => clearTimeout(t);
  }, [numeric, spring]);

  const display = useTransform(spring, (current) => `${prefix}${Number(current).toFixed(decimalPlaces)}${suffix}`);

  return <motion.span className={`${isGlowing ? "glow-animation" : ""} ${className}`.trim()}>{display}</motion.span>;
}
