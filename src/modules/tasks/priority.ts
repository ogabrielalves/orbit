import type { TaskPriority } from "@/bindings";

export type PriorityTone = "neutral" | "info" | "warning" | "danger";

export const priorityTones: Record<TaskPriority, PriorityTone> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  urgent: "danger",
};
