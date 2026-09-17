import { Skeleton } from "@/components/ui/skeleton";

export default function AppLoading() {
  return (
    <div className="space-y-4" aria-label="Loading">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[96px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[320px] rounded-xl" />
    </div>
  );
}
