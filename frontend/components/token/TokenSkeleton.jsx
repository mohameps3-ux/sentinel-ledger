function Bone({ className = "" }) {
  return <div className={`skeleton-shimmer rounded ${className}`} />;
}

export function TokenSkeleton() {
  return (
    <div className="tpt-center animate-pulse">
      {/* Header identity row */}
      <div className="tpt-c-header">
        <div className="tpt-c-header-identity">
          <Bone className="h-3 w-28" />
          <div className="flex items-center gap-3 mt-3">
            <Bone className="h-10 w-10 rounded-full flex-shrink-0" />
            <div className="space-y-2 flex-1 min-w-0">
              <Bone className="h-4 w-20" />
              <Bone className="h-3 w-32" />
              <Bone className="h-3 w-24" />
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="tpt-c-header-stats mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2 rounded border border-white/[0.06] bg-white/[0.02] p-3">
              <Bone className="h-2 w-16" />
              <Bone className="h-5 w-12" />
              <Bone className="h-2 w-10" />
            </div>
          ))}
        </div>
      </div>

      {/* Chart area */}
      <div className="mt-2">
        <Bone className="h-8 w-full" />
        <Bone className="mt-1 h-[200px] w-full sm:h-[280px]" />
      </div>

      {/* Smart money flow */}
      <div className="mt-2 space-y-2 border-t border-white/[0.06] pt-3">
        <Bone className="h-3 w-32" />
        <div className="grid grid-cols-2 gap-2">
          <Bone className="h-16" />
          <Bone className="h-16" />
        </div>
      </div>

      {/* Narrative 2-col */}
      <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/[0.06] pt-3">
        <div className="space-y-2">
          <Bone className="h-2 w-24" />
          <Bone className="h-3 w-full" />
          <Bone className="h-3 w-5/6" />
          <Bone className="h-3 w-4/6" />
        </div>
        <div className="space-y-2">
          <Bone className="h-2 w-20" />
          <Bone className="h-3 w-full" />
          <Bone className="h-3 w-5/6" />
          <Bone className="h-3 w-3/6" />
        </div>
      </div>

      {/* Trade bar */}
      <div className="mt-2 flex gap-2 border-t border-white/[0.06] pt-3">
        <Bone className="h-10 flex-1" />
        <Bone className="h-10 w-16" />
        <Bone className="h-10 w-16" />
      </div>
    </div>
  );
}
