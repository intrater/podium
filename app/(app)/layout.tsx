import type { ReactNode } from "react";

/**
 * Authenticated-app layout (v1 ships with stub auth; the route group
 * exists so v3 real auth slots in without restructuring).
 *
 * Holds the top app bar — team chip on the left, settings slot on the
 * right — and the main scroll container. The body itself is full-width
 * mobile-first; we cap to a single column up to 640px and let the page
 * decide its own max width above that.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background flex min-h-full flex-col">
      <header className="border-border/40 bg-background/80 sticky top-0 z-30 border-b backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="bg-team-accent size-2 rounded-full"
            />
            <span className="text-foreground text-sm font-semibold tracking-tight">
              49ers
            </span>
            <span className="text-muted-foreground text-xs">
              · Podium
            </span>
          </div>
          {/* Settings slot — wakes up in v2 with team switching and feedback
              insights. Reserves the position so the header doesn't reflow. */}
          <div className="text-muted-foreground/40 text-xs">v1</div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-4">
        {children}
      </main>
    </div>
  );
}
