import type { ActivityAction, EntityType, FieldChange } from "@/bindings";
import type { Clock } from "./projects";
import type { State } from "./state";

export type Changes = Record<string, FieldChange>;

export function track(changes: Changes, field: string, from: string | null, to: string | null) {
  if (from !== to) {
    changes[field] = { from, to };
  }
}

export function createRecorder(state: State, clock: Clock) {
  return function record(
    entityType: EntityType,
    entityId: string,
    action: ActivityAction,
    changes: Changes | null = null,
  ) {
    const hasChanges = changes !== null && Object.keys(changes).length > 0;
    state.activity.unshift({
      id: clock.nextId("a"),
      entityType,
      entityId,
      action,
      changes: hasChanges ? changes : null,
      createdAt: clock.now(),
    });
  };
}

export type Recorder = ReturnType<typeof createRecorder>;
