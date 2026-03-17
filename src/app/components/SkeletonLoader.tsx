export function SkeletonLoader() {
  const wingSkeletons = [
    { id: 1, tables: 4 },
    { id: 2, tables: 3 },
  ];

  return (
    <div className="space-y-4 animate-pulse">
      {wingSkeletons.map((wing) => (
        <div key={wing.id} className="space-y-3 rounded-xl border border-slate-200/70 bg-white/75 p-3 shadow-sm md:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg px-2 py-1.5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-slate-200/80"></div>
              <div className="space-y-2">
                <div className="h-4 w-24 rounded bg-slate-200/80"></div>
                <div className="h-3 w-16 rounded bg-slate-200/70"></div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="h-6 w-24 rounded-full bg-slate-200/70"></div>
              <div className="hidden h-6 w-28 rounded-full bg-slate-200/70 sm:block"></div>
              <div className="h-3 w-16 rounded bg-slate-200/70"></div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: wing.tables }).map((_, index) => (
              <div key={index} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/60 bg-white px-2.5 py-1.5">
                <div className="flex items-center gap-2">
                  <div className="h-3.5 w-3.5 rounded bg-slate-200/80"></div>
                  <div className="space-y-2">
                    <div className="h-3 w-16 rounded bg-slate-200/80"></div>
                    <div className="h-2.5 w-10 rounded bg-slate-200/70"></div>
                  </div>
                </div>
                <div className="h-3 w-10 rounded bg-slate-200/70"></div>
                <div className="hidden h-3 w-10 rounded-full bg-slate-200/70 sm:block"></div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
