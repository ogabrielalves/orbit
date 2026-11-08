import type { ButtonHTMLAttributes, ComponentType, MouseEvent, SVGProps } from "react";
import { Spinner } from "@/components/atoms/Spinner";

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
type ButtonSize = "sm" | "md";

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary font-semibold text-fg-on-primary hover:bg-primary-hover disabled:bg-border disabled:text-fg-disabled",
  secondary:
    "border border-border-strong bg-surface font-medium text-fg hover:bg-surface-muted disabled:border-border disabled:bg-canvas disabled:text-fg-disabled",
  ghost:
    "font-medium text-fg-secondary hover:bg-surface-muted hover:text-fg disabled:bg-transparent disabled:text-fg-subtle",
  destructive:
    "bg-danger-solid font-semibold text-fg-on-primary hover:bg-danger-solid-hover focus-visible:shadow-focus-danger disabled:bg-danger-disabled disabled:text-danger-disabled-fg",
};

const sizeClasses: Record<ButtonSize, string> = {
  md: "h-10 px-4 text-body",
  sm: "h-9 px-3.5 text-small",
};

export function Button({
  variant = "primary",
  size = "md",
  isLoading = false,
  icon: Icon,
  type = "button",
  onClick,
  children,
  ...rest
}: ButtonProps) {
  const hasIcon = Icon !== undefined;
  const shouldShowIcon = hasIcon && !isLoading;

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (isLoading) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }

  return (
    <button
      type={type}
      aria-busy={isLoading}
      onClick={handleClick}
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-md whitespace-nowrap transition-colors disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]}`}
      {...rest}
    >
      {isLoading && <Spinner />}
      {shouldShowIcon && <Icon aria-hidden="true" className="size-4" />}
      {children}
    </button>
  );
}
