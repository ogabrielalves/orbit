import { useTranslation } from "react-i18next";
import { Button } from "@/components/atoms/Button";
import type { SaveStatus } from "@/pages/notes/editor/useNoteAutosave";

type SaveIndicatorProps = {
  status: SaveStatus;
  onRetry: () => void;
  onResolve: () => void;
};

const dotClasses: Record<SaveStatus, string> = {
  saved: "bg-success",
  dirty: "bg-warning",
  saving: "bg-primary animate-pulse motion-reduce:animate-none",
  error: "bg-danger",
  conflict: "bg-danger",
};

export function SaveIndicator({ status, onRetry, onResolve }: SaveIndicatorProps) {
  const { t } = useTranslation();
  const hasFailed = status === "error";
  const isInConflict = status === "conflict";

  return (
    <div className="flex items-center gap-2">
      <span role="status" className="flex items-center gap-1.5 text-caption text-fg-muted">
        <span aria-hidden="true" className={`size-2 rounded-full ${dotClasses[status]}`} />
        {t(`notes.editor.status.${status}`)}
      </span>
      {hasFailed && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t("notes.editor.status.retry")}
        </Button>
      )}
      {isInConflict && (
        <Button variant="secondary" size="sm" onClick={onResolve}>
          {t("notes.editor.status.resolve")}
        </Button>
      )}
    </div>
  );
}
