import { useLocation } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { MAIN_CONTENT_ID } from "@/components/molecules/SkipLink";
import { isDialogOpen } from "@/lib/shortcuts";

export function useRouteFocus(title: string, isActive: boolean): string {
  const location = useLocation({
    select: (current) => ({ pathname: current.pathname, search: current.search }),
  });
  const previousPathname = useRef(location.pathname);
  const [hasNavigated, setHasNavigated] = useState(false);
  const pathname = location.pathname;
  const opensDialog = "new" in location.search;

  useEffect(() => {
    const hasChangedPage = previousPathname.current !== pathname;
    previousPathname.current = pathname;
    if (!hasChangedPage || !isActive) {
      return;
    }

    setHasNavigated(true);
    const canMoveFocus = !opensDialog && !isDialogOpen();
    if (canMoveFocus) {
      document.getElementById(MAIN_CONTENT_ID)?.focus({ preventScroll: true });
    }
  }, [pathname, opensDialog, isActive]);

  return hasNavigated ? title : "";
}
