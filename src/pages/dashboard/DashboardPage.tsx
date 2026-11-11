import { useState } from "react";
import { useTranslation } from "react-i18next";
import PlusIcon from "@/assets/icons/linha/mais.svg?react";
import { Button } from "@/components/atoms/Button";
import { PageHeader } from "@/components/molecules/PageHeader";
import { ProjectFormModal } from "@/components/organisms/ProjectFormModal";
import { formatLongDate, toLocalIsoDate } from "@/lib/dates";
import { getGreetingPeriod } from "@/lib/greeting";
import { useProjectForm } from "@/modules/projects/useProjectForm";
import { useSettings } from "@/modules/settings/queries";
import { ActiveProjectsCard } from "@/pages/dashboard/ActiveProjectsCard";
import { RecentActivityCard } from "@/pages/dashboard/RecentActivityCard";
import { RecentNotesCard } from "@/pages/dashboard/RecentNotesCard";
import { SummaryStrip } from "@/pages/dashboard/SummaryStrip";
import { UpcomingDeadlinesCard } from "@/pages/dashboard/UpcomingDeadlinesCard";

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const now = new Date();
  const greetingPeriod = getGreetingPeriod(now);
  const userName = useSettings().data?.userName ?? null;
  const hasUserName = userName !== null;
  const greeting = hasUserName
    ? t(`greetingNamed.${greetingPeriod}`, { name: userName })
    : t(`greeting.${greetingPeriod}`);
  const today = toLocalIsoDate(now);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const projectForm = useProjectForm(undefined, () => setIsFormOpen(false));

  return (
    <>
      <PageHeader
        variant="display"
        title={greeting}
        subtitle={formatLongDate(now, i18n.language)}
        actions={
          <Button icon={PlusIcon} onClick={() => setIsFormOpen(true)}>
            {t("projects.newProject")}
          </Button>
        }
      />
      <div className="flex flex-col gap-6">
        <SummaryStrip today={today} />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-6">
            <ActiveProjectsCard />
            <RecentNotesCard />
          </div>
          <div className="flex flex-col gap-6">
            <UpcomingDeadlinesCard today={today} now={now} />
            <RecentActivityCard />
          </div>
        </div>
      </div>
      {isFormOpen && (
        <ProjectFormModal
          mode={projectForm.mode}
          initialValues={projectForm.initialValues}
          colorOptions={projectForm.colorOptions}
          isSubmitting={projectForm.isSubmitting}
          onSubmit={projectForm.submit}
          onOpenChange={() => setIsFormOpen(false)}
        />
      )}
    </>
  );
}
