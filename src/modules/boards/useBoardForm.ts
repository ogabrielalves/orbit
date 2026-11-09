import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { BoardDetails } from "@/bindings";
import type { BoardFormValues } from "@/components/organisms/BoardFormModal";
import { useCreateBoard } from "@/modules/boards/queries";
import { DEFAULT_BOARD_TEMPLATE_ID } from "@/modules/boards/templates";
import { useBoardTemplates } from "@/modules/boards/useBoardTemplates";

export function useBoardForm(projectId: string, onCreated: (details: BoardDetails) => void) {
  const { t } = useTranslation();
  const createBoard = useCreateBoard();
  const templates = useBoardTemplates();

  async function submit(values: BoardFormValues): Promise<void> {
    const details = await createBoard.mutateAsync({
      projectId,
      name: values.name,
      columns: values.columns,
    });

    toast.success(t("boards.toast.boardCreated"));
    onCreated(details);
  }

  return {
    templates,
    defaultTemplateId: DEFAULT_BOARD_TEMPLATE_ID,
    isSubmitting: createBoard.isPending,
    submit,
  };
}
