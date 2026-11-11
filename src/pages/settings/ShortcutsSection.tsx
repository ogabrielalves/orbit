import { useTranslation } from "react-i18next";
import { Kbd } from "@/components/atoms/Kbd";
import { formatHotkey } from "@/lib/formatHotkey";
import { creationShortcuts } from "@/lib/shortcuts";
import { SettingsSection } from "@/pages/settings/SettingsSection";

const shortcuts = [
  { combo: "mod+k", labelKey: "settings.shortcuts.search" },
  { combo: "mod+\\", labelKey: "settings.shortcuts.sidebar" },
  { combo: "mod+enter", labelKey: "settings.shortcuts.submit" },
  { combo: creationShortcuts.newProject, labelKey: "settings.shortcuts.newProject" },
  { combo: creationShortcuts.newTask, labelKey: "settings.shortcuts.newTask" },
  { combo: creationShortcuts.newBoard, labelKey: "settings.shortcuts.newBoard" },
  { combo: creationShortcuts.newNote, labelKey: "settings.shortcuts.newNote" },
] as const;

export function ShortcutsSection() {
  const { t } = useTranslation();
  const isMac = /mac/i.test(navigator.platform);

  return (
    <SettingsSection
      title={t("settings.shortcuts.title")}
      description={t("settings.shortcuts.description")}
    >
      <ul className="flex flex-col divide-y divide-border">
        {shortcuts.map(({ combo, labelKey }) => (
          <li
            key={combo}
            className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
          >
            <span className="text-small text-fg">{t(labelKey)}</span>
            <span className="flex items-center gap-1">
              {formatHotkey(combo, isMac).map((key) => (
                <Kbd key={key} variant="strong">
                  {key}
                </Kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </SettingsSection>
  );
}
