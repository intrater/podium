/**
 * v1 scaffolding landing — replaced wholesale by `app/(app)/page.tsx` in U11.
 * Kept minimal here so the design tokens (background, foreground, team accent,
 * Geist Sans + Mono) can be eyeballed before the real digest grid lands.
 */
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="bg-team-accent inline-block size-3 rounded-full"
        />
        <h1 className="font-sans text-5xl font-semibold tracking-tight text-foreground">
          Podium
        </h1>
      </div>
      <p className="font-mono text-sm text-muted-foreground">
        v1 scaffolding · 49ers digest
      </p>
      <button
        type="button"
        className="bg-team-accent text-team-accent-fg rounded-md px-4 py-2 text-sm font-medium"
      >
        Play sample
      </button>
    </main>
  );
}
