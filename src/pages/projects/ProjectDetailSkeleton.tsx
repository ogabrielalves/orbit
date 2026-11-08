import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/atoms/Skeleton";

export function ProjectDetailSkeleton() {
  const { t } = useTranslation();

  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">{t("common.loading")}</span>
      <div className="flex items-start gap-4">
        <Skeleton className="size-14 rounded-xl" />
        <div className="flex flex-1 flex-col gap-3">
          <Skeleton className="h-7 w-2/5" />
          <Skeleton className="h-4 w-24 rounded-full" />
          <Skeleton className="h-3.5 w-3/5" />
        </div>
      </div>
      <Skeleton className="h-24 w-full rounded-2xl" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    </div>
  );
}
