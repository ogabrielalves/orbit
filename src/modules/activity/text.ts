import type { TFunction } from "i18next";
import type { ActivityEntry } from "@/bindings";

export type ActivityTarget = { kind: "project"; projectId: string } | null;

export function getActivityName(entry: ActivityEntry): string | null {
  const nameChange = entry.changes?.name;
  const hasNameChange = nameChange !== undefined;
  if (!hasNameChange) {
    return null;
  }

  const name = nameChange.to ?? nameChange.from;
  const hasName = name !== null && name.trim() !== "";
  return hasName ? name : null;
}

export function getActivityTarget(entry: ActivityEntry): ActivityTarget {
  const isProject = entry.entityType === "project";
  const isDeleted = entry.action === "deleted";
  const canOpen = isProject && !isDeleted;
  return canOpen ? { kind: "project", projectId: entry.entityId } : null;
}

export function formatActivityMessage(t: TFunction, entry: ActivityEntry): string {
  const entity = t(`activity.entity.${entry.entityType}`);
  const isFemale = t(`activity.gender.${entry.entityType}`) === "female";
  const action = isFemale
    ? t(`activity.action.${entry.action}.female`)
    : t(`activity.action.${entry.action}.male`);
  const name = getActivityName(entry);
  const hasName = name !== null;

  if (hasName) {
    return t("activity.messageNamed", { entity, name, action });
  }
  return t("activity.messageUnnamed", { entity, action });
}
