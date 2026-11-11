import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import type { Settings } from "@/bindings";
import { useSettings } from "@/modules/settings/queries";

export const WELCOME_PATH = "/welcome";

export type OnboardingGate = "loading" | "redirecting" | "ready";

export function isOnboarded(settings: Settings): boolean {
  const hasVault = settings.vaultPath !== null;
  const hasName = settings.userName !== null;
  return hasVault && hasName;
}

export function useOnboardingGuard(): OnboardingGate {
  const settingsQuery = useSettings();
  const navigate = useNavigate();
  const pathname = useLocation({ select: (location) => location.pathname });

  const settings = settingsQuery.data;
  const isLoading = settingsQuery.isPending;
  const isOnWelcome = pathname === WELCOME_PATH;
  const hasSettings = settings !== undefined;
  const onboarded = hasSettings && isOnboarded(settings);
  const needsWelcome = hasSettings && !onboarded && !isOnWelcome;
  const needsDashboard = onboarded && isOnWelcome;
  const isRedirecting = needsWelcome || needsDashboard;

  useEffect(() => {
    if (needsWelcome) {
      void navigate({ to: WELCOME_PATH, replace: true });
      return;
    }
    if (needsDashboard) {
      void navigate({ to: "/", replace: true });
    }
  }, [needsWelcome, needsDashboard, navigate]);

  if (isLoading) {
    return "loading";
  }
  return isRedirecting ? "redirecting" : "ready";
}
