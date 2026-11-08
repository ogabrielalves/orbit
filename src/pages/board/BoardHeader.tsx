import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import PlusIcon from "@/assets/icons/linha/mais.svg?react";
import MoreIcon from "@/assets/icons/linha/mais-opcoes.svg?react";
import BackIcon from "@/assets/icons/linha/voltar.svg?react";
import type { Board } from "@/bindings";
import { Button } from "@/components/atoms/Button";
import { IconButton } from "@/components/atoms/IconButton";
import { DropdownMenu } from "@/components/molecules/DropdownMenu";
import { MAX_COLUMNS_PER_BOARD } from "@/modules/boards/limits";

type BoardHeaderProps = {
  board: Board;
  columnCount: number;
  taskCount: number;
  onNewColumn: () => void;
  onRename: () => void;
  onDelete: () => void;
};

export function BoardHeader({
  board,
  columnCount,
  taskCount,
  onNewColumn,
  onRename,
  onDelete,
}: BoardHeaderProps) {
  const { t } = useTranslation();
  const isAtColumnLimit = columnCount >= MAX_COLUMNS_PER_BOARD;

  return (
    <header className="flex flex-col gap-3">
      <Link
        to="/projects/$projectId"
        params={{ projectId: board.projectId }}
        className="inline-flex w-fit items-center gap-1 text-small font-medium text-fg-muted transition-colors hover:text-fg"
      >
        <BackIcon aria-hidden="true" className="size-4" />
        {t("boards.back")}
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-heading-1 font-semibold text-fg">{board.name}</h1>
          <p className="text-small text-fg-muted">
            {t("boards.columnCount", { count: columnCount })} ·{" "}
            {t("boards.taskCount", { count: taskCount })}
          </p>
          {isAtColumnLimit && (
            <p className="text-caption text-warning-fg">
              {t("boards.maxColumns", { max: MAX_COLUMNS_PER_BOARD })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button icon={PlusIcon} onClick={onNewColumn} disabled={isAtColumnLimit}>
            {t("boards.newColumn")}
          </Button>
          <DropdownMenu
            trigger={<IconButton icon={MoreIcon} label={t("boards.boardActions")} />}
            sections={[
              [{ id: "rename", label: t("boards.renameBoard"), onSelect: onRename }],
              [
                {
                  id: "delete",
                  label: t("boards.deleteBoard"),
                  onSelect: onDelete,
                  isDanger: true,
                },
              ],
            ]}
          />
        </div>
      </div>
    </header>
  );
}
