import { Users } from "lucide-react";

interface Table {
  tableId: number;
  tableNumber: number;
  seatingCapacity: number;
}

interface TableCardProps {
  table: Table;
  isSelected?: boolean;
  onToggle?: (tableId: number) => void;
}

export function TableCard({ table, isSelected = false, onToggle }: TableCardProps) {
  const selectedStyles = isSelected
    ? "border-emerald-400 bg-emerald-50/70"
    : "border-slate-200/80 bg-white";

  const checkboxId = `table-${table.tableId}`;

  return (
    <label
      htmlFor={checkboxId}
      className={`group flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs leading-tight transition-all duration-150 hover:border-emerald-200 focus-within:ring-2 focus-within:ring-emerald-200 ${selectedStyles}`}
    >
      <div className="flex items-center gap-2">
        <input
          id={checkboxId}
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggle?.(table.tableId)}
          className="h-3.5 w-3.5 accent-emerald-600"
        />
        <div className="font-semibold text-slate-900">Table #{table.tableNumber}</div>
      </div>
      <div className="flex items-center gap-1 text-[0.65rem] font-semibold text-slate-600">
        <Users className="h-3 w-3 text-emerald-600" />
        {table.seatingCapacity}
      </div>
    </label>
  );
}
