"use client";

import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function ExpansionError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <section className="mx-auto flex max-w-2xl flex-col items-start gap-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-700">
          <AlertTriangle aria-hidden="true" className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-500">Expansion workspace</p>
          <h1 className="mt-1 text-xl font-bold text-slate-950">This workspace could not load</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            No Expansion record was changed. Retry the workspace, or return to the portfolio dashboard and continue from another authorized view.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
            type="button"
            onClick={reset}
          >
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            Retry
          </button>
          <Link
            className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
            href="/expansion"
          >
            Back to Expansion Dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
