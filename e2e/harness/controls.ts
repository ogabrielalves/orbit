import type { ErrorPayload } from "@/bindings";
import type { Seed } from "../fixture/state";

export type RecordedCall = { command: string; args: unknown };

export type OrbitControls = {
  unmocked: string[];
  calls: RecordedCall[];
  failNext: (command: string, error: ErrorPayload) => void;
  setDialogResult: (value: string | string[] | null) => void;
  emit: (event: string, payload?: unknown) => Promise<void>;
  storedState: () => unknown;
};

declare global {
  interface Window {
    __ORBIT_SEED__?: Seed;
    __orbit?: OrbitControls;
  }
}
