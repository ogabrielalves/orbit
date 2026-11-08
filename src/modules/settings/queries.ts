import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSettings, saveSettings } from "@/modules/settings/api";

export const settingsKeys = {
  all: ["settings"] as const,
};

export function useSettings() {
  return useQuery({ queryKey: settingsKeys.all, queryFn: fetchSettings });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveSettings,
    onSuccess: (settings) => {
      queryClient.setQueryData(settingsKeys.all, settings);
    },
  });
}
