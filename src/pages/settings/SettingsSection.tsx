import type { ReactNode } from "react";

type SettingsSectionProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function SettingsSection({ title, description, children }: SettingsSectionProps) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-heading-3 font-semibold text-fg">{title}</h2>
        <p className="text-small text-fg-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}
