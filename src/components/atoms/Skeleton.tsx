type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className = "h-3 w-full" }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded-xs bg-skeleton motion-reduce:animate-none ${className}`}
    />
  );
}
