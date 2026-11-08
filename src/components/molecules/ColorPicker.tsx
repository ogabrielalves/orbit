import { useId } from "react";

export type ColorOption<TValue extends string> = {
  value: TValue;
  label: string;
  color: string;
};

type ColorPickerProps<TValue extends string> = {
  label: string;
  options: ColorOption<TValue>[];
  value: TValue;
  onChange: (value: TValue) => void;
};

export function ColorPicker<TValue extends string>({
  label,
  options,
  value,
  onChange,
}: ColorPickerProps<TValue>) {
  const groupName = useId();

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => (
        <label
          key={option.value}
          title={option.label}
          style={{ backgroundColor: option.color }}
          className="relative size-7 cursor-pointer rounded-full has-checked:ring-2 has-checked:ring-fg has-checked:ring-offset-2 has-checked:ring-offset-surface has-focus-visible:shadow-focus"
        >
          <input
            type="radio"
            name={groupName}
            value={option.value}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
            className="sr-only focus-visible:shadow-none"
          />
          <span className="sr-only">{option.label}</span>
        </label>
      ))}
    </div>
  );
}
