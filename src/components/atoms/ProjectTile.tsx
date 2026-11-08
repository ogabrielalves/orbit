type ProjectTileSize = "sm" | "md" | "lg";

type ProjectTileProps = {
  name: string;
  color: string;
  size?: ProjectTileSize;
};

const sizeClasses: Record<ProjectTileSize, string> = {
  sm: "size-6 rounded-sm text-micro",
  md: "size-10 rounded-lg text-heading-3",
  lg: "size-14 rounded-xl text-heading-2",
};

export function ProjectTile({ name, color, size = "md" }: ProjectTileProps) {
  const initial = name.trim().charAt(0).toUpperCase();

  return (
    <span
      aria-hidden="true"
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 14%, var(--color-surface))`,
      }}
      className={`inline-flex shrink-0 items-center justify-center font-display font-bold ${sizeClasses[size]}`}
    >
      {initial}
    </span>
  );
}
