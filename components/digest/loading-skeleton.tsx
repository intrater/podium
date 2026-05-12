import { Skeleton } from "@/components/ui/skeleton";

/**
 * Card-shaped placeholder for the first-run loading state. Density mirrors
 * the real grid (5 cards above the fold) so the page doesn't jump when
 * data lands.
 */
export function DigestLoadingSkeleton() {
  return (
    <ul className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <li
          key={i}
          className="bg-card flex gap-4 rounded-xl p-4"
        >
          <Skeleton className="size-24 shrink-0 rounded-lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="mt-2 h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
          </div>
        </li>
      ))}
    </ul>
  );
}
