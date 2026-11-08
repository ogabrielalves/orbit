import { useId } from "react";
import { useTranslation } from "react-i18next";
import {
  type ProjectColorKey,
  projectColorKeys,
  resolveProjectColor,
} from "@/modules/projects/colors";

type ProjectColorPickerProps = {
  label: string;
  value: ProjectColorKey;
  onChange: (color: ProjectColorKey) => void;
};

export function ProjectColorPicker({ label, value, onChange }: ProjectColorPickerProps) {
  const { t } = useTranslation();
  const groupName = useId();

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {projectColorKeys.map((color) => (
        <label
          key={color}
          title={t(`projects.colors.${color}`)}
          style={{ backgroundColor: resolveProjectColor(color) }}
          className="relative size-7 cursor-pointer rounded-full has-checked:ring-2 has-checked:ring-fg has-checked:ring-offset-2 has-checked:ring-offset-surface has-focus-visible:shadow-focus"
        >
          <input
            type="radio"
            name={groupName}
            value={color}
            checked={color === value}
            onChange={() => onChange(color)}
            className="sr-only focus-visible:shadow-none"
          />
          <span className="sr-only">{t(`projects.colors.${color}`)}</span>
        </label>
      ))}
    </div>
  );
}
