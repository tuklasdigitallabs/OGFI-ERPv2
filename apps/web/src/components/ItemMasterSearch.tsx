"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

export function ItemMasterSearch({ scopeId }: { scopeId: string }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [visibleCount, setVisibleCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const normalizedQuery = useMemo(() => query.trim().toLowerCase(), [query]);

  useEffect(() => {
    const rows = Array.from(
      document.querySelectorAll<HTMLElement>(`[data-master-scope="${scopeId}"]`)
    );
    let visible = 0;

    for (const row of rows) {
      const searchable = row.dataset.searchable?.toLowerCase() ?? "";
      const rowStatus = row.dataset.status ?? "";
      const matchesQuery =
        !normalizedQuery || searchable.includes(normalizedQuery);
      const matchesStatus = status === "ALL" || rowStatus === status;
      const shouldShow = matchesQuery && matchesStatus;
      row.hidden = !shouldShow;
      if (shouldShow) {
        visible += 1;
      }
    }

    setVisibleCount(visible);
    setTotalCount(rows.length);
  }, [normalizedQuery, scopeId, status]);

  return (
    <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 md:grid-cols-[1fr_12rem_auto] md:items-center">
      <label className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 shadow-sm">
        <Search aria-hidden="true" className="h-4 w-4 text-slate-400" />
        <input
          className="min-w-0 flex-1 bg-transparent outline-none"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search code, name, type, controls..."
          type="search"
          value={query}
        />
      </label>
      <select
        className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm"
        onChange={(event) => setStatus(event.target.value)}
        value={status}
      >
        <option value="ALL">All statuses</option>
        <option value="ACTIVE">Active</option>
        <option value="INACTIVE">Inactive</option>
      </select>
      <span className="text-sm font-medium text-slate-500">
        {visibleCount} / {totalCount} shown
      </span>
    </div>
  );
}
