import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import PlusIcon from "@/assets/icons/linha/mais.svg?react";
import type { ProjectBoard } from "@/bindings";
import { Button } from "@/components/atoms/Button";
import { EmptyState } from "@/components/molecules/EmptyState";
import { formatShortDate } from "@/lib/dates";

type ProjectBoardsProps = {
  boards: ProjectBoard[];
  onCreate: () => void;
};

export function ProjectBoards({ boards, onCreate }: ProjectBoardsProps) {
  const { t, i18n } = useTranslation();
  const hasBoards = boards.length > 0;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-heading-2 font-semibold text-fg">
          {t("projects.detail.boardsTitle")}
        </h2>
        <Button variant="secondary" icon={PlusIcon} onClick={onCreate}>
          {t("projects.detail.newBoard")}
        </Button>
      </div>
      {hasBoards ? (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {boards.map((board) => (
            <li key={board.id}>
              <Link
                to="/boards/$boardId"
                params={{ boardId: board.id }}
                className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-md"
              >
                <span className="truncate text-heading-3 font-semibold text-fg">{board.name}</span>
                <span className="flex items-center justify-between gap-3 text-caption text-fg-muted">
                  <span>{t("projects.detail.boardTasks", { count: board.taskCount })}</span>
                  <span>
                    {t("projects.created", {
                      date: formatShortDate(new Date(board.createdAt), i18n.language),
                    })}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title={t("projects.detail.noBoards.title")}
          description={t("projects.detail.noBoards.description")}
        />
      )}
    </section>
  );
}
