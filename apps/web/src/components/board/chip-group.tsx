/** A labelled row of filter chips (links that change the URL). */
export function ChipGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a labelled group of links, not form controls
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      {children}
    </div>
  );
}
