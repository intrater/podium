/**
 * Empty-state surface — shown when an ingest run completed but landed
 * zero cards. Quiet days happen (niche team, off-season); the copy
 * reassures rather than implies a system failure.
 */
export function DigestEmptyFallback() {
  return (
    <div className="bg-card flex flex-col items-start gap-3 rounded-xl p-6">
      <h2 className="text-base font-semibold text-foreground">
        Nothing new today
      </h2>
      <p className="text-sm text-muted-foreground">
        No 49ers content turned up in the last 3 days. Check back tomorrow,
        or expand your sources later in v2.
      </p>
    </div>
  );
}
