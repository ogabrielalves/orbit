import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/molecules/PageHeader";
import { formatLongDate } from "@/lib/dates";
import { getGreetingPeriod } from "@/lib/greeting";
import { ActiveProjectsCard } from "@/pages/dashboard/ActiveProjectsCard";
import { RecentActivityCard } from "@/pages/dashboard/RecentActivityCard";

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const now = new Date();
  const greetingPeriod = getGreetingPeriod(now);

  return (
    <>
      <PageHeader
        variant="display"
        title={t(`greeting.${greetingPeriod}`)}
        subtitle={formatLongDate(now, i18n.language)}
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
        <ActiveProjectsCard />
        <RecentActivityCard />
      </div>
    </>
  );
}
