export function TokenSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 animate-pulse">
      <div className="h-40 bg-gray-800 rounded-2xl w-full" />
      <div className="h-32 bg-gray-800 rounded-2xl w-full" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="h-64 bg-gray-800 rounded-2xl" />
        <div className="h-64 bg-gray-800 rounded-2xl" />
      </div>
    </div>
  );
}

