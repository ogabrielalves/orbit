import { CheckList, type CheckListEntry } from "@/components/organisms/CheckList";
import { CHECKLIST_ITEM_MAX_LENGTH } from "@/modules/checklist/limits";
import {
  useChecklist,
  useCreateChecklistItem,
  useDeleteChecklistItem,
  useMoveChecklistItem,
  useUpdateChecklistItem,
} from "@/modules/checklist/queries";

type TaskChecklistProps = {
  taskId: string;
};

export function TaskChecklist({ taskId }: TaskChecklistProps) {
  const checklistQuery = useChecklist(taskId);
  const createItem = useCreateChecklistItem(taskId);
  const updateItem = useUpdateChecklistItem(taskId);
  const deleteItem = useDeleteChecklistItem(taskId);
  const moveItem = useMoveChecklistItem(taskId);

  const entries: CheckListEntry[] = (checklistQuery.data ?? []).map((item) => ({
    id: item.id,
    text: item.text,
    isDone: item.isDone,
  }));

  return (
    <CheckList
      kind="checklist"
      entries={entries}
      maxLength={CHECKLIST_ITEM_MAX_LENGTH}
      isAdding={createItem.isPending}
      onAdd={(text) => createItem.mutate(text)}
      onToggle={(id, isDone) => updateItem.mutate({ id, input: { isDone } })}
      onRename={(id, text) => updateItem.mutate({ id, input: { text } })}
      onDelete={(id) => deleteItem.mutate(id)}
      onMove={(reorder) => moveItem.mutate(reorder)}
    />
  );
}
