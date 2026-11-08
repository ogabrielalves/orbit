import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/molecules/PageHeader";
import { formatLongDate } from "@/lib/dates";
import { getGreetingPeriod } from "@/lib/greeting";

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const now = new Date();
  const greetingPeriod = getGreetingPeriod(now);

  return (
    <PageHeader
      variant="display"
      title={t(`greeting.${greetingPeriod}`)}
      subtitle={formatLongDate(now, i18n.language)}
    />
  );
}
