import type { MouseEvent } from "react";

export const MAIN_CONTENT_ID = "main-content";

type SkipLinkProps = {
  label: string;
};

export function SkipLink({ label }: SkipLinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    document.getElementById(MAIN_CONTENT_ID)?.focus();
  }

  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      onClick={handleClick}
      className="sr-only rounded-md bg-surface px-4 py-2.5 text-small font-semibold text-primary-fg shadow-md focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-70"
    >
      {label}
    </a>
  );
}
