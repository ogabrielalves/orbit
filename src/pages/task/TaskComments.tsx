import { type FormEvent, type KeyboardEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import MoreIcon from "@/assets/icons/linha/mais-opcoes.svg?react";
import type { Comment } from "@/bindings";
import { Button } from "@/components/atoms/Button";
import { IconButton } from "@/components/atoms/IconButton";
import { Textarea } from "@/components/atoms/Textarea";
import { DropdownMenu } from "@/components/molecules/DropdownMenu";
import { QueryStatus } from "@/components/molecules/QueryStatus";
import { ConfirmDialog } from "@/components/organisms/ConfirmDialog";
import { formatRelativeTime } from "@/lib/dates";
import { matchesHotkey } from "@/lib/hotkey";
import { COMMENT_MAX_LENGTH } from "@/modules/comments/limits";
import {
  useComments,
  useCreateComment,
  useDeleteComment,
  useUpdateComment,
} from "@/modules/comments/queries";

type TaskCommentsProps = {
  taskId: string;
};

type CommentItemProps = {
  taskId: string;
  comment: Comment;
};

function submitOnShortcut(event: KeyboardEvent<HTMLFormElement>) {
  const isSubmitShortcut = matchesHotkey("mod+enter", event);
  if (isSubmitShortcut) {
    event.preventDefault();
    event.currentTarget.requestSubmit();
  }
}

function CommentItem({ taskId, comment }: CommentItemProps) {
  const { t, i18n } = useTranslation();
  const updateComment = useUpdateComment(taskId);
  const deleteComment = useDeleteComment(taskId);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [draft, setDraft] = useState(comment.body);

  const isDraftBlank = draft.trim() === "";
  const hasChange = draft.trim() !== comment.body;
  const canSave = !isDraftBlank && hasChange;
  const wasEdited = comment.updatedAt !== comment.createdAt;
  const createdAgo = formatRelativeTime(new Date(comment.createdAt), new Date(), i18n.language);

  function startEditing() {
    setDraft(comment.body);
    setIsEditing(true);
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) {
      return;
    }
    updateComment.mutate(
      { id: comment.id, body: draft.trim() },
      { onSuccess: () => setIsEditing(false) },
    );
  }

  function handleEditKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      setIsEditing(false);
      return;
    }
    submitOnShortcut(event);
  }

  function handleDelete() {
    deleteComment.mutate(comment.id, {
      onSuccess: () => {
        toast.success(t("tasks.comments.toast.deleted"));
        setIsDeleting(false);
      },
    });
  }

  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption text-fg-muted">
          {createdAgo}
          {wasEdited && <span> · {t("tasks.comments.edited")}</span>}
        </span>
        <DropdownMenu
          trigger={<IconButton icon={MoreIcon} size="sm" label={t("tasks.comments.actions")} />}
          sections={[
            [{ id: "edit", label: t("tasks.comments.edit"), onSelect: startEditing }],
            [
              {
                id: "delete",
                label: t("tasks.comments.delete"),
                isDanger: true,
                onSelect: () => setIsDeleting(true),
              },
            ],
          ]}
        />
      </div>
      {isEditing ? (
        <form
          onSubmit={handleSave}
          onKeyDown={handleEditKeyDown}
          data-escape-scope=""
          className="flex flex-col gap-2"
        >
          <Textarea
            rows={4}
            value={draft}
            maxLength={COMMENT_MAX_LENGTH}
            aria-label={t("tasks.comments.editLabel")}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={!canSave} isLoading={updateComment.isPending}>
              {t("common.save")}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-body break-words whitespace-pre-wrap text-fg">{comment.body}</p>
      )}
      {isDeleting && (
        <ConfirmDialog
          isOpen
          tone="danger"
          title={t("tasks.comments.confirm.deleteTitle")}
          description={t("tasks.comments.confirm.deleteDescription")}
          confirmLabel={t("tasks.comments.confirm.deleteConfirm")}
          isConfirming={deleteComment.isPending}
          onConfirm={handleDelete}
          onCancel={() => setIsDeleting(false)}
        />
      )}
    </li>
  );
}

export function TaskComments({ taskId }: TaskCommentsProps) {
  const { t } = useTranslation();
  const commentsQuery = useComments(taskId);
  const createComment = useCreateComment(taskId);
  const [body, setBody] = useState("");

  const comments = commentsQuery.data ?? [];
  const hasComments = comments.length > 0;
  const hasNoComments = commentsQuery.isSuccess && !hasComments;
  const isBodyBlank = body.trim() === "";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBodyBlank || createComment.isPending) {
      return;
    }
    createComment.mutate(body.trim(), { onSuccess: () => setBody("") });
  }

  return (
    <section aria-label={t("tasks.comments.title")} className="flex flex-col gap-2">
      <h3 className="font-display text-heading-3 font-semibold text-fg">
        {t("tasks.comments.title")}
      </h3>
      <QueryStatus
        isPending={commentsQuery.isPending}
        isError={commentsQuery.isError}
        errorTitle={t("tasks.comments.loadError")}
        onRetry={() => void commentsQuery.refetch()}
      />
      {hasComments && (
        <ul aria-label={t("tasks.comments.list")} className="flex flex-col gap-2">
          {comments.map((comment) => (
            <CommentItem key={comment.id} taskId={taskId} comment={comment} />
          ))}
        </ul>
      )}
      {hasNoComments && <p className="text-small text-fg-muted">{t("tasks.comments.empty")}</p>}
      <form onSubmit={handleSubmit} onKeyDown={submitOnShortcut} className="flex flex-col gap-2">
        <Textarea
          rows={3}
          value={body}
          maxLength={COMMENT_MAX_LENGTH}
          aria-label={t("tasks.comments.newLabel")}
          placeholder={t("tasks.comments.placeholder")}
          onChange={(event) => setBody(event.target.value)}
        />
        <div className="flex justify-end">
          <Button
            type="submit"
            size="sm"
            disabled={isBodyBlank}
            isLoading={createComment.isPending}
          >
            {t("tasks.comments.submit")}
          </Button>
        </div>
      </form>
    </section>
  );
}
