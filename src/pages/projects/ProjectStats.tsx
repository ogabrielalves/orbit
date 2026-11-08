import { useTranslation } from "react-i18next";

type ProjectStatsProps = {
  taskCount: number;
  backlogTaskCount: number;
  boardCount: number;
};

export function ProjectStats({ taskCount, backlogTaskCount, boardCount }: ProjectStatsProps) {
  const { t } = useTranslation();

  const stats = [
    { id: "tasks", label: t("projects.detail.stats.tasks"), value: taskCount },
    { id: "backlog", label: t("projects.detail.stats.backlog"), value: backlogTaskCount },
    { id: "boards", label: t("projects.detail.stats.boards"), value: boardCount },
  ];

  return (
    <dl
      aria-label={t("projects.detail.statsLabel")}
      className="grid grid-cols-1 divide-y divide-border rounded-2xl border border-border bg-surface md:grid-cols-3 md:divide-x md:divide-y-0"
    >
      {stats.map((stat) => (
        <div key={stat.id} className="flex flex-col gap-1 px-6 py-5">
          <dt className="text-small text-fg-secondary">{stat.label}</dt>
          <dd className="font-display text-stat font-semibold text-fg tabular-nums">
            {stat.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
