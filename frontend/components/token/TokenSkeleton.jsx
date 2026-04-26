export function TokenSkeleton() {
  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-6">
      <div className="h-40 skeleton-shimmer w-full" />
      <div className="h-36 skeleton-shimmer w-full" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="h-72 skeleton-shimmer lg:col-span-2" />
        <div className="h-72 skeleton-shimmer " />
      </div>
    </div>
  );
}

