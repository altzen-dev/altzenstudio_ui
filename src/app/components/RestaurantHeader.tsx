import { MapPin } from "lucide-react";

interface RestaurantHeaderProps {
  orgName: string;
  orgAddress: string;
  branchName: string;
}

export function RestaurantHeader({ orgName, orgAddress, branchName }: RestaurantHeaderProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/70 bg-orange-500 p-5 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.45)] backdrop-blur motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-700 md:p-7">
      <div className="pointer-events-none absolute -right-16 -top-20 h-40 w-40 rounded-full bg-emerald-200/40 blur-3xl" aria-hidden="true"></div>
      <div className="pointer-events-none absolute -left-20 -bottom-24 h-40 w-40 rounded-full bg-amber-200/50 blur-3xl" aria-hidden="true"></div>

      <div className="relative z-10">
        {/* Top Section: Organization */}
        <div className="flex flex-col gap-3 border-b border-emerald-100/70 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg shadow-emerald-200/50">
              <span className="text-xl font-semibold tracking-wide">RR</span>
            </div>
            <div className="min-w-0">
              <p className="text-[0.65rem] uppercase tracking-[0.35em] text-emerald-800">Restaurant</p>
              <h1 className="mt-2 text-2xl font-semibold text-black md:text-3xl">
                {orgName}
              </h1>
              <div className="mt-2 flex items-center gap-2 text-slate-700">
                <MapPin className="h-4 w-4 flex-shrink-0 text-emerald-800" />
                <p className="text-sm md:text-base">{orgAddress}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Section: Branch */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium uppercase tracking-[0.3em] text-slate-700">Current Branch</span>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-800 bg-emerald-900 px-4 py-1.5 text-emerald-100">
            <div className="h-2 w-2 rounded-full bg-emerald-300"></div>
            <span className="text-sm font-semibold">{branchName}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
