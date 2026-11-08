import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/atoms/Skeleton";

const placeholderIds = ["a", "b", "c", "d", "e", "f"];

export function ProjectsSkeleton() {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      aria-busy="true"
      className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
    >
      <span className="sr-only">{t("common.loading")}</span>
      {placeholderIds.map((id) => (
        <div
          key={id}
          className="flex flex-col gap-3.5 rounded-2xl border border-border bg-surface p-5"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-lg" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3.5 w-3/5" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="mt-3 h-3 w-full" />
        </div>
      ))}
    </div>
  );
}
