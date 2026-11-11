import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import TrashIcon from "@/assets/icons/linha/lixeira.svg?react";
import type { Attachment } from "@/bindings";
import { Button } from "@/components/atoms/Button";
import { IconButton } from "@/components/atoms/IconButton";
import { QueryStatus } from "@/components/molecules/QueryStatus";
import { ConfirmDialog } from "@/components/organisms/ConfirmDialog";
import { formatFileSize } from "@/lib/format";
import {
  useAttachments,
  useImportAttachment,
  useOpenAttachment,
  useRemoveAttachment,
} from "@/modules/attachments/queries";
import { useFileDrop } from "@/modules/attachments/useFileDrop";

type TaskAttachmentsProps = {
  taskId: string;
};

export function TaskAttachments({ taskId }: TaskAttachmentsProps) {
  const { t, i18n } = useTranslation();
  const attachmentsQuery = useAttachments(taskId);
  const importAttachment = useImportAttachment(taskId);
  const removeAttachment = useRemoveAttachment(taskId);
  const openAttachment = useOpenAttachment();
  const [isImporting, setIsImporting] = useState(false);
  const [attachmentToRemove, setAttachmentToRemove] = useState<Attachment | null>(null);

  const attachments = attachmentsQuery.data ?? [];
  const hasAttachments = attachments.length > 0;
  const isRemoveOpen = attachmentToRemove !== null;

  async function importFiles(paths: string[]) {
    setIsImporting(true);
    let attachedCount = 0;
    for (const sourcePath of paths) {
      try {
        await importAttachment.mutateAsync({ taskId, sourcePath });
        attachedCount += 1;
      } catch {}
    }
    setIsImporting(false);

    const hasAttached = attachedCount > 0;
    if (hasAttached) {
      toast.success(t("tasks.attachments.toast.attached", { count: attachedCount }));
    }
  }

  async function pickFiles() {
    const selected = await open({ multiple: true, directory: false });
    const paths = selected ?? [];
    const hasPaths = paths.length > 0;
    if (hasPaths) {
      await importFiles(paths);
    }
  }

  const isDraggingFiles = useFileDrop((paths) => void importFiles(paths));
  const zoneClass = isDraggingFiles
    ? "border-primary bg-primary-soft text-primary-fg"
    : "border-border-strong text-fg-muted";

  function handleRemove(target: Attachment) {
    removeAttachment.mutate(target.id, {
      onSuccess: () => {
        toast.success(t("tasks.attachments.toast.removed"));
        setAttachmentToRemove(null);
      },
    });
  }

  return (
    <section aria-label={t("tasks.attachments.title")} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-heading-3 font-semibold text-fg">
          {t("tasks.attachments.title")}
        </h3>
        <Button
          variant="secondary"
          size="sm"
          isLoading={isImporting}
          onClick={() => void pickFiles()}
        >
          {t("tasks.attachments.attach")}
        </Button>
      </div>
      <QueryStatus
        isPending={attachmentsQuery.isPending}
        isError={attachmentsQuery.isError}
        errorTitle={t("tasks.attachments.loadError")}
        onRetry={() => void attachmentsQuery.refetch()}
      />
      {hasAttachments && (
        <ul aria-label={t("tasks.attachments.list")} className="flex flex-col gap-2">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex items-center gap-3 rounded-lg border border-border p-3"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body font-medium text-fg">
                  {attachment.fileName}
                </span>
                <span className="text-caption text-fg-muted">
                  {formatFileSize(attachment.sizeBytes, i18n.language)}
                </span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                aria-label={t("tasks.attachments.open", { name: attachment.fileName })}
                onClick={() => openAttachment.mutate(attachment.id)}
              >
                {t("tasks.attachments.openShort")}
              </Button>
              <IconButton
                icon={TrashIcon}
                size="sm"
                label={t("tasks.attachments.remove", { name: attachment.fileName })}
                onClick={() => setAttachmentToRemove(attachment)}
              />
            </li>
          ))}
        </ul>
      )}
      <p
        role="status"
        className={`rounded-lg border border-dashed px-3 py-4 text-center text-small transition-colors ${zoneClass}`}
      >
        {isImporting
          ? t("tasks.attachments.importing")
          : t(isDraggingFiles ? "tasks.attachments.dropNow" : "tasks.attachments.dropHint")}
      </p>
      {isRemoveOpen && (
        <ConfirmDialog
          isOpen
          tone="danger"
          title={t("tasks.attachments.confirm.removeTitle", { name: attachmentToRemove.fileName })}
          description={t("tasks.attachments.confirm.removeDescription")}
          confirmLabel={t("tasks.attachments.confirm.removeConfirm")}
          isConfirming={removeAttachment.isPending}
          onConfirm={() => handleRemove(attachmentToRemove)}
          onCancel={() => setAttachmentToRemove(null)}
        />
      )}
    </section>
  );
}
