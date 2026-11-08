import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { Project, ProjectStatus } from "@/bindings";
import {
  defaultProjectColorKey,
  projectColorKeys,
  resolveProjectColor,
} from "@/modules/projects/colors";
import { useCreateProject, useUpdateProject } from "@/modules/projects/queries";

type ProjectFormValues = {
  name: string;
  description: string;
  color: string;
  status: ProjectStatus;
};

type ColorOption = {
  value: string;
  label: string;
  color: string;
};

function pickInitialColor(color: string | null): string {
  const savedColor = projectColorKeys.find((key) => key === color);
  return savedColor ?? defaultProjectColorKey;
}

export function useProjectForm(project: Project | undefined, onSaved: (project: Project) => void) {
  const { t } = useTranslation();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();

  const isEditing = project !== undefined;

  const initialValues: ProjectFormValues = {
    name: project?.name ?? "",
    description: project?.description ?? "",
    color: pickInitialColor(project?.color ?? null),
    status: project?.status ?? "active",
  };

  const colorOptions: ColorOption[] = projectColorKeys.map((key) => ({
    value: key,
    label: t(`projects.colors.${key}`),
    color: resolveProjectColor(key),
  }));

  async function submit(values: ProjectFormValues): Promise<void> {
    const saved = isEditing
      ? await updateProject.mutateAsync({ id: project.id, input: values })
      : await createProject.mutateAsync({
          name: values.name,
          description: values.description,
          color: values.color,
        });

    toast.success(t(isEditing ? "projects.toast.updated" : "projects.toast.created"));
    onSaved(saved);
  }

  return {
    mode: isEditing ? ("edit" as const) : ("create" as const),
    initialValues,
    colorOptions,
    isSubmitting: createProject.isPending || updateProject.isPending,
    submit,
  };
}
