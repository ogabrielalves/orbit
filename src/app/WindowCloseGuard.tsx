import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/organisms/ConfirmDialog";
import { flushCloseGuards } from "@/lib/closeGuards";

export const CLOSE_FLUSH_TIMEOUT_IN_MILLISECONDS = 5000;

async function flushWithTimeout(): Promise<boolean> {
  const timeout = new Promise<boolean>((resolve) => {
    setTimeout(() => resolve(false), CLOSE_FLUSH_TIMEOUT_IN_MILLISECONDS);
  });
  return Promise.race([flushCloseGuards(), timeout]);
}

export function WindowCloseGuard() {
  const { t } = useTranslation();
  const [isPromptOpen, setIsPromptOpen] = useState(false);

  useEffect(() => {
    const isDesktopApp = isTauri();
    if (!isDesktopApp) {
      return;
    }

    const unlisten = getCurrentWindow().onCloseRequested(async (event) => {
      const canClose = await flushWithTimeout();
      if (!canClose) {
        event.preventDefault();
        setIsPromptOpen(true);
      }
    });

    return () => {
      void unlisten.then((stopListening) => stopListening());
    };
  }, []);

  async function handleRetry() {
    const canClose = await flushWithTimeout();
    if (canClose) {
      await getCurrentWindow().destroy();
    }
  }

  async function handleDiscard() {
    await getCurrentWindow().destroy();
  }

  return (
    isPromptOpen && (
      <ConfirmDialog
        isOpen
        tone="danger"
        title={t("app.closeGuard.title")}
        description={t("app.closeGuard.description")}
        confirmLabel={t("app.closeGuard.discard")}
        secondaryAction={{
          label: t("app.closeGuard.retry"),
          onSelect: () => void handleRetry(),
        }}
        onConfirm={() => void handleDiscard()}
        onCancel={() => setIsPromptOpen(false)}
      />
    )
  );
}
