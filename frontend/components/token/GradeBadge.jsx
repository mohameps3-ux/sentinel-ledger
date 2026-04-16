const GRADE_STYLES = {
  "A+": "bg-purple-600",
  A: "bg-green-600",
  B: "bg-green-500",
  C: "bg-yellow-500 text-black",
  D: "bg-orange-500",
  F: "bg-red-600"
};

export function GradeBadge({ grade, confidence }) {
  const style = GRADE_STYLES[grade] || GRADE_STYLES.F;
  return (
    <div className={`px-3 py-1 rounded-full text-sm font-bold text-white ${style}`}>
      {grade} · {confidence}%
    </div>
  );
}

