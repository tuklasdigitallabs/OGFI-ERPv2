import Link from "next/link";

const DEFAULT_PAGE_SIZE = 10;

export function getPaginationState(
  totalCount: number,
  pageParam?: string | number,
  pageSize = DEFAULT_PAGE_SIZE
) {
  const parsedPage =
    typeof pageParam === "number"
      ? pageParam
      : Number.parseInt(String(pageParam ?? "1"), 10);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Number.isFinite(parsedPage)
    ? Math.min(Math.max(parsedPage, 1), totalPages)
    : 1;

  return {
    page,
    pageSize,
    totalPages,
    startIndex: (page - 1) * pageSize,
    endIndex: Math.min(page * pageSize, totalCount)
  };
}

function buildHref(
  basePath: string,
  tab: string,
  page: number,
  pageParam: string,
  tabParam: string
) {
  const params = new URLSearchParams();
  params.set(tabParam, tab);
  params.set(pageParam, String(page));
  return `${basePath}?${params.toString()}`;
}

export function FinancePagination({
  basePath,
  tab,
  page,
  totalPages,
  totalCount,
  startIndex,
  endIndex,
  pageParam = "page",
  tabParam = "tab"
}: {
  basePath: string;
  tab: string;
  page: number;
  totalPages: number;
  totalCount: number;
  startIndex: number;
  endIndex: number;
  pageParam?: string;
  tabParam?: string;
}) {
  if (totalCount <= DEFAULT_PAGE_SIZE) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
      <p>
        Showing {startIndex + 1}-{endIndex} of {totalCount}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          aria-disabled={page === 1}
          className={
            page === 1
              ? "pointer-events-none inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-slate-100 px-3 font-semibold text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
              : "inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-white px-3 font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
          }
          href={buildHref(basePath, tab, Math.max(1, page - 1), pageParam, tabParam)}
        >
          Previous
        </Link>
        <span className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Page {page} of {totalPages}
        </span>
        <Link
          aria-disabled={page === totalPages}
          className={
            page === totalPages
              ? "pointer-events-none inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-slate-100 px-3 font-semibold text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
              : "inline-flex min-h-9 items-center rounded-lg border border-blue-200 bg-blue-50 px-3 font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100 dark:hover:bg-blue-900"
          }
          href={buildHref(basePath, tab, Math.min(totalPages, page + 1), pageParam, tabParam)}
        >
          Next
        </Link>
      </div>
    </div>
  );
}
