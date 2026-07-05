import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn("skeleton rounded-lg", className)} />;
}

export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div className={cn("glass-card p-5 space-y-3", className)}>
      <div className="flex items-center gap-3">
        <Skeleton className="w-9 h-9 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-2 w-16" />
        </div>
      </div>
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-2 w-full" />
      <Skeleton className="h-2 w-3/4" />
    </div>
  );
}

export function SkeletonRow({ className }: SkeletonProps) {
  return (
    <div className={cn("flex items-center gap-4 py-3", className)}>
      <Skeleton className="w-8 h-8 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-2 w-32" />
      </div>
      <Skeleton className="h-5 w-16 rounded-full" />
    </div>
  );
}

export function SkeletonChart({ className }: SkeletonProps) {
  return (
    <div className={cn("glass-card p-5", className)}>
      <div className="flex items-center gap-3 mb-5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-5 w-16 rounded-full ml-auto" />
      </div>
      <div className="flex items-end gap-2 h-32">
        {[60, 80, 45, 90, 70, 55, 85, 65, 75, 50, 88, 72].map((h, i) => (
          <Skeleton key={i} className="flex-1 rounded-sm" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}
