import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import PlusIcon from "@/assets/icons/linha/mais.svg?react";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { useCreateTask } from "@/modules/tasks/queries";

const TITLE_MAX_LENGTH = 200;

type QuickAddTaskProps = {
  projectId: string;
  columnId: string;
  columnName: string;
};

export function QuickAddTask({ projectId, columnId, columnName }: QuickAddTaskProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const createTask = useCreateTask();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");

  const isTitleBlank = title.trim() === "";

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  function close() {
    setIsOpen(false);
    setTitle("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isTitleBlank || createTask.isPending) {
      return;
    }

    createTask.mutate(
      { projectId, columnId, title: title.trim() },
      {
        onSuccess: () => {
          setTitle("");
          inputRef.current?.focus();
        },
      },
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
    }
  }

  if (!isOpen) {
    return (
      <Button
        variant="ghost"
        size="sm"
        icon={PlusIcon}
        aria-label={t("boards.quickAdd.open", { name: columnName })}
        onClick={() => setIsOpen(true)}
      >
        {t("boards.quickAdd.openShort")}
      </Button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      aria-label={t("boards.quickAdd.form", { name: columnName })}
      className="flex flex-col gap-2"
    >
      <Input
        ref={inputRef}
        size="compact"
        value={title}
        maxLength={TITLE_MAX_LENGTH}
        aria-label={t("boards.quickAdd.label")}
        placeholder={t("boards.quickAdd.placeholder")}
        onChange={(event) => setTitle(event.target.value)}
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isTitleBlank} isLoading={createTask.isPending}>
          {t("boards.quickAdd.submit")}
        </Button>
        <Button variant="ghost" size="sm" onClick={close}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
