const GRADE_STYLES = {
  "A+": "from-violet-500 to-fuchsia-500 shadow-[0_0_24px_rgba(168,85,247,0.55)]",
  A: "from-emerald-500 to-green-600 shadow-[0_0_20px_rgba(34,197,94,0.45)]",
  B: "from-teal-500 to-green-500 shadow-[0_0_18px_rgba(20,184,166,0.35)]",
  C: "from-amber-400 to-yellow-500 text-black shadow-[0_0_18px_rgba(250,204,21,0.35)]",
  D: "from-orange-500 to-amber-600 shadow-[0_0_18px_rgba(249,115,22,0.35)]",
  F: "from-rose-500 to-red-600 shadow-[0_0_20px_rgba(239,68,68,0.45)]"
};

export function GradeBadge({ grade, confidence }) {
  const style = GRADE_STYLES[grade] || GRADE_STYLES.F;
  return (
    <div
      className={`rounded-full bg-gradient-to-r px-4 py-2 text-sm font-extrabold text-white ${style}`}
      title="Sentinel risk grade calculated from contract security, liquidity, holders and deployer profile."
    >
      {grade} · {confidence}%
    </div>
  );
}

