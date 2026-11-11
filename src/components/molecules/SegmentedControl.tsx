import { type ComponentType, type SVGProps, useId } from "react";
import { Tooltip } from "@/components/atoms/Tooltip";

type SegmentedVariant = "pill" | "bordered";

export type SegmentedOption<TValue extends string> = {
  value: TValue;
  label: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
};

type SegmentedControlProps<TValue extends string> = {
  label: string;
  options: SegmentedOption<TValue>[];
  value: TValue;
  onChange: (value: TValue) => void;
  variant?: SegmentedVariant;
  isIconOnly?: boolean;
};

const groupClasses: Record<SegmentedVariant, string> = {
  pill: "inline-flex gap-0.5 rounded-md bg-surface-muted p-0.75",
  bordered: "inline-flex overflow-hidden rounded-md border border-border-strong bg-surface",
};

const optionClasses: Record<SegmentedVariant, string> = {
  pill: "flex cursor-pointer items-center gap-1.5 rounded-sm px-3 py-1.5 text-small text-fg-secondary transition-colors has-checked:bg-surface has-checked:font-medium has-checked:text-fg has-checked:shadow-sm has-focus-visible:shadow-focus",
  bordered:
    "flex h-9 w-9.5 cursor-pointer items-center justify-center text-fg-muted transition-colors has-checked:bg-surface-muted has-checked:text-fg has-focus-visible:shadow-focus",
};

type SegmentedItemProps<TValue extends string> = {
  option: SegmentedOption<TValue>;
  groupName: string;
  variant: SegmentedVariant;
  isSelected: boolean;
  isIconOnly: boolean;
  onChange: (value: TValue) => void;
};

function SegmentedItem<TValue extends string>({
  option,
  groupName,
  variant,
  isSelected,
  isIconOnly,
  onChange,
}: SegmentedItemProps<TValue>) {
  const Icon = option.icon;
  const hasIcon = Icon !== undefined;
  const labelClass = isIconOnly ? "sr-only" : "";

  const item = (
    <label className={optionClasses[variant]}>
      <input
        type="radio"
        name={groupName}
        value={option.value}
        checked={isSelected}
        onChange={() => onChange(option.value)}
        className="sr-only focus-visible:shadow-none"
      />
      {hasIcon && <Icon aria-hidden="true" className="size-4 shrink-0" />}
      <span className={labelClass}>{option.label}</span>
    </label>
  );

  return isIconOnly ? (
    <Tooltip label={option.label} labelsTrigger>
      {item}
    </Tooltip>
  ) : (
    item
  );
}

export function SegmentedControl<TValue extends string>({
  label,
  options,
  value,
  onChange,
  variant = "pill",
  isIconOnly = false,
}: SegmentedControlProps<TValue>) {
  const groupName = useId();

  return (
    <div role="radiogroup" aria-label={label} className={groupClasses[variant]}>
      {options.map((option) => (
        <SegmentedItem
          key={option.value}
          option={option}
          groupName={groupName}
          variant={variant}
          isSelected={option.value === value}
          isIconOnly={isIconOnly}
          onChange={onChange}
        />
      ))}
    </div>
  );
}
