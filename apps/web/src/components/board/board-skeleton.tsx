import { Skeleton } from "@/components/ui/states";

/** Loading state shaped like the board: a toolbar and four columns of cards. */
export function BoardSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="flex gap-2">
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-8 w-32 rounded-full" />
      </div>
      <div className="grid min-w-[880px] grid-cols-4 gap-3 overflow-hidden">
        {[0, 1, 2, 3].map((column) => (
          <div key={column} className="flex flex-col gap-2 rounded-xl bg-sunken p-2">
            <Skeleton className="m-1.5 h-4 w-24" />
            {[0, 1, 2].map((card) => (
              <div key={card} className="flex flex-col gap-2 rounded-lg border bg-card p-3">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
