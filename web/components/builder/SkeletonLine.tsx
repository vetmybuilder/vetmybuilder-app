// web/components/builder/SkeletonLine.tsx

type SkeletonLineProps = {
  className?: string;
};

export default function SkeletonLine({ className = "" }: SkeletonLineProps) {
  return (
    <div
      className={`animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-800 ${className}`}
    />
  );
}
