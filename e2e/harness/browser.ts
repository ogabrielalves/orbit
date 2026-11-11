import { emit } from "@tauri-apps/api/event";
import { mockIPC } from "@tauri-apps/api/mocks";
import type { ErrorPayload } from "@/bindings";
import { createHandlers } from "../fixture/handlers";
import { loadState, STORAGE_KEY, saveState } from "../fixture/state";
import type { CommandName } from "../fixture/types";
import type { OrbitControls, RecordedCall } from "./controls";

const ID_DIGITS = 6;
const FAILURES_KEY = "orbit-e2e-failures";

type Failures = Record<string, ErrorPayload[]>;

function readFailures(): Failures {
  return JSON.parse(window.sessionStorage.getItem(FAILURES_KEY) ?? "{}") as Failures;
}

function takeFailure(command: string): ErrorPayload | undefined {
  const failures = readFailures();
  const next = failures[command]?.shift();
  window.sessionStorage.setItem(FAILURES_KEY, JSON.stringify(failures));
  return next;
}

function camelize(command: string): string {
  return command.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function install() {
  const state = loadState(window.__ORBIT_SEED__ ?? {}, window.sessionStorage);
  const clock = {
    nextId: (prefix: string) => {
      state.sequence += 1;
      return `${prefix}${String(state.sequence).padStart(ID_DIGITS, "0")}`;
    },
    now: () => new Date().toISOString(),
  };
  const handlers = createHandlers(state, clock);
  const calls: RecordedCall[] = [];
  const unmocked: string[] = [];
  let dialogResult: string | string[] | null = null;

  const controls: OrbitControls = {
    unmocked,
    calls,
    failNext: (command, error) => {
      const failures = readFailures();
      failures[command] = [...(failures[command] ?? []), error];
      window.sessionStorage.setItem(FAILURES_KEY, JSON.stringify(failures));
    },
    setDialogResult: (value) => {
      dialogResult = value;
    },
    emit: (event, payload) => emit(event, payload),
    storedState: () => JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "null"),
  };
  window.__orbit = controls;

  mockIPC(
    (command, args) => {
      calls.push({ command, args });
      if (command.startsWith("plugin:dialog|")) {
        return dialogResult;
      }
      const queued = takeFailure(command);
      if (queued !== undefined) {
        throw queued;
      }
      const handler = handlers[camelize(command) as CommandName] as
        | ((...values: unknown[]) => unknown)
        | undefined;
      if (handler === undefined) {
        unmocked.push(command);
        throw new Error(`unmocked command ${command}`);
      }
      const values = Object.values((args ?? {}) as Record<string, unknown>);
      const result = handler(...values);
      saveState(state, window.sessionStorage);
      return structuredClone(result);
    },
    { shouldMockEvents: true },
  );
  saveState(state, window.sessionStorage);
}

install();
