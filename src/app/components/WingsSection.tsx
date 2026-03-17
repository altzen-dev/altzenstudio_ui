import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { TableCard } from "@/app/components/TableCard";

interface Table {
  tableId: number;
  tableNumber: number;
  seatingCapacity: number;
}

interface Wing {
  wingId: number;
  wingName: string;
  dTables: Table[];
}

interface WingsSectionProps {
  wings: Wing[];
}

export function WingsSection({ wings }: WingsSectionProps) {
  const [expandedWingIds, setExpandedWingIds] = useState<Set<number>>(() => new Set());
  const [selectedTables, setSelectedTables] = useState<Set<number>>(() => new Set());

  const toggleWing = (wingId: number) => {
    setExpandedWingIds((prev) => {
      const next = new Set(prev);
      if (next.has(wingId)) {
        next.delete(wingId);
      } else {
        next.add(wingId);
      }
      return next;
    });
  };

  const toggleTableSelection = (tableId: number) => {
    setSelectedTables((prev) => {
      const next = new Set(prev);
      if (next.has(tableId)) {
        next.delete(tableId);
      } else {
        next.add(tableId);
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedTables(new Set());
  };

  const totalSelectedSeats = wings.reduce((sum, wing) => {
    return sum + wing.dTables.reduce((inner, table) => {
      return selectedTables.has(table.tableId) ? inner + table.seatingCapacity : inner;
    }, 0);
  }, 0);

  const totalSelectedTables = selectedTables.size;

  return (
    <div className="space-y-4">
      {totalSelectedTables > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-emerald-900">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white">
              <Check className="h-3.5 w-3.5" />
            </div>
            <div>
              <p className="text-[0.65rem] uppercase tracking-[0.3em] text-emerald-700/70">Selected</p>
              <p className="text-xs font-semibold">
                {totalSelectedTables} tables • {totalSelectedSeats} seats
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={clearSelection}
            className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-emerald-700 transition hover:bg-emerald-100"
          >
            Clear selection
          </button>
        </div>
      )}

      {wings.map((wing) => {
        const isExpanded = expandedWingIds.has(wing.wingId);
        const wingSelectedSeats = wing.dTables.reduce((sum, table) => {
          return sum + (selectedTables.has(table.tableId) ? table.seatingCapacity : 0);
        }, 0);
        const wingSelectedTables = wing.dTables.filter((table) => selectedTables.has(table.tableId)).length;
        const wingCapacity = wing.dTables.reduce((sum, table) => sum + table.seatingCapacity, 0);

        return (
          <div key={wing.wingId} className="space-y-3 rounded-xl border border-slate-200/70 bg-white/75 p-3 shadow-sm md:p-4">
            {/* Wing Header */}
            <button
              type="button"
              onClick={() => toggleWing(wing.wingId)}
              aria-expanded={isExpanded}
              className="w-full rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 sm:items-center">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-200/60">
                    <span className="text-lg font-bold">{wing.wingName}</span>
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 md:text-lg">Wing {wing.wingName}</h3>
                    <p className="text-xs text-slate-500">
                      {wing.dTables.length} {wing.dTables.length === 1 ? "table" : "tables"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                  {wingSelectedSeats > 0 && (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[0.6rem] font-semibold text-emerald-700 sm:text-[0.65rem]">
                      {wingSelectedTables} tables • {wingSelectedSeats} seats
                    </span>
                  )}
                  <div className="hidden items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50/80 px-3 py-1.5 text-emerald-800 sm:flex">
                    <span className="text-[0.65rem] uppercase tracking-[0.2em] text-emerald-700/70">Total Capacity</span>
                    <span className="text-xs font-semibold">
                      {wingCapacity}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[0.6rem] font-semibold uppercase tracking-[0.15em] text-slate-500 sm:text-[0.65rem] sm:tracking-[0.2em]">
                    <span className="sm:hidden">{isExpanded ? "Hide" : "View"}</span>
                    <span className="hidden sm:inline">{isExpanded ? "Hide tables" : "View tables"}</span>
                    <ChevronDown className={`h-3.5 w-3.5 transition ${isExpanded ? "rotate-180" : ""}`} />
                  </div>
                </div>
              </div>
            </button>

            {/* Tables Grid */}
            {isExpanded && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {wing.dTables.map((table) => (
                    <TableCard
                      key={table.tableId}
                      table={table}
                      isSelected={selectedTables.has(table.tableId)}
                      onToggle={toggleTableSelection}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Empty State */}
      {wings.length === 0 && (
        <div className="rounded-2xl border border-dashed border-amber-200 bg-white/70 py-16 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
            <span className="text-3xl">🪑</span>
          </div>
          <h3 className="mb-1 text-lg font-semibold text-slate-700">No Tables Available</h3>
          <p className="text-sm text-slate-500">This layout doesn't have any tables configured yet.</p>
        </div>
      )}
    </div>
  );
}
