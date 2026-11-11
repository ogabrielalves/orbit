import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/atoms/Skeleton";

const rowIds = ["a", "b", "c", "d"];

export function RoutePending() {
  const { t } = useTranslation();

  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">{t("common.loading")}</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-1/3" />
        <Skeleton className="h-3.5 w-1/4" />
      </div>
      <div className="flex flex-col gap-3">
        {rowIds.map((id) => (
          <Skeleton key={id} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
