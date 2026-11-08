import { Link, type LinkProps } from "@tanstack/react-router";
import type { ComponentType, SVGProps } from "react";
import { Tooltip } from "@/components/atoms/Tooltip";

type NavItemProps = {
  to: LinkProps["to"];
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  isCollapsed: boolean;
};

export function NavItem({ to, icon: Icon, label, isCollapsed }: NavItemProps) {
  const isRoot = to === "/";
  const alignmentClass = isCollapsed ? "justify-center" : "";
  const labelClass = isCollapsed ? "sr-only" : "flex-1 truncate";

  return (
    <Tooltip label={label} side="right" isDisabled={!isCollapsed}>
      <Link
        to={to}
        activeOptions={{ exact: isRoot }}
        className={`flex h-9.5 items-center gap-3 rounded-md px-2.5 text-body font-medium transition-colors ${alignmentClass}`}
        activeProps={{ className: "bg-primary-soft text-primary-fg" }}
        inactiveProps={{ className: "text-fg-secondary hover:bg-surface-muted" }}
      >
        <Icon aria-hidden="true" className="size-5 shrink-0" />
        <span className={labelClass}>{label}</span>
      </Link>
    </Tooltip>
  );
}
