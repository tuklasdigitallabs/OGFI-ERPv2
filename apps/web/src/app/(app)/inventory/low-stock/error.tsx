"use client";
export default function ErrorState({ reset }: { reset: () => void }) { return <div role="alert" className="grid gap-4 p-4"><p>Low-stock monitoring could not be loaded. No stock or thresholds were changed.</p><button onClick={reset} className="min-h-11 rounded-md border px-4 py-2">Try again</button></div>; }
