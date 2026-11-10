import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NoteDetails } from "@/bindings";
import {
  AUTOSAVE_DELAY_IN_MILLISECONDS,
  useNoteAutosave,
} from "@/pages/notes/editor/useNoteAutosave";

const commands = vi.hoisted(() => ({ saveNote: vi.fn() }));

vi.mock("@/bindings", () => ({ commands }));

const note: NoteDetails = {
  id: "n1",
  path: "Plan.md",
  title: "Plan",
  tags: [],
  createdAt: "2026-11-08T10:00:00Z",
  modifiedAt: "2026-11-08T10:00:00Z",
  content: "# Plan",
  hash: "h1",
};

function saved(hash: string): { status: "ok"; data: NoteDetails } {
  return { status: "ok", data: { ...note, hash } };
}

function renderAutosave(initial: NoteDetails = note) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(({ current }) => useNoteAutosave(current), {
    wrapper,
    initialProps: { current: initial },
  });
}

async function wait(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

describe("useNoteAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    commands.saveNote.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts saved and does not save when nothing changed", async () => {
    const { result } = renderAutosave();

    await wait(AUTOSAVE_DELAY_IN_MILLISECONDS * 2);

    expect(result.current.status).toBe("saved");
    expect(commands.saveNote).not.toHaveBeenCalled();
  });

  it("marks the note as unsaved and saves once after the delay", async () => {
    commands.saveNote.mockResolvedValue(saved("h2"));
    const { result } = renderAutosave();

    act(() => result.current.handleChange("# Plan\n\none"));
    act(() => result.current.handleChange("# Plan\n\none two"));
    expect(result.current.status).toBe("dirty");
    expect(commands.saveNote).not.toHaveBeenCalled();
    await wait(AUTOSAVE_DELAY_IN_MILLISECONDS);

    expect(commands.saveNote).toHaveBeenCalledTimes(1);
    expect(commands.saveNote).toHaveBeenCalledWith("n1", {
      content: "# Plan\n\none two",
      baseHash: "h1",
      force: false,
    });
    expect(result.current.status).toBe("saved");
  });

  it("uses the hash returned by the last save as the next base", async () => {
    commands.saveNote.mockResolvedValueOnce(saved("h2")).mockResolvedValueOnce(saved("h3"));
    const { result } = renderAutosave();

    act(() => result.current.handleChange("first"));
    await wait(AUTOSAVE_DELAY_IN_MILLISECONDS);
    act(() => result.current.handleChange("second"));
    await wait(AUTOSAVE_DELAY_IN_MILLISECONDS);

    expect(commands.saveNote).toHaveBeenLastCalledWith("n1", {
      content: "second",
      baseHash: "h2",
      force: false,
    });
  });

  it("goes back to saved without a request when the text returns to the saved one", async () => {
    const { result } = renderAutosave();

    act(() => result.current.handleChange("changed"));
    act(() => result.current.handleChange(note.content));
    await wait(AUTOSAVE_DELAY_IN_MILLISECONDS);

    expect(result.current.status).toBe("saved");
    expect(commands.saveNote).not.toHaveBeenCalled();
  });

  it("shows the saving state while the request is pending", async () => {
    let finish: (value: unknown) => void = () => undefined;
    commands.saveNote.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { result } = renderAutosave();

    act(() => result.current.handleChange("changed"));
    await wait(AUTOSAVE_DELAY_IN_MILLISECONDS);
    expect(result.current.status).toBe("saving");
    await act(async () => finish(saved("h2")));

    expect(result.current.status).toBe("saved");
  });

  it("saves again when the user kept typing during the request", async () => {
    let finish: (value: unknown) => void = () => undefined;
    commands.saveNote
      .mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
      .mockResolvedValueOnce(saved("h3"));
    const { result } = renderAutosave();

    act(() => result.current.handleChange("one"));
    await wait(AUTOSAVE_DELAY_IN_MILLISECONDS);
    act(() => result.current.handleChange("one two"));
    await act(async () => finish(saved("h2")));
    expect(result.current.status).toBe("dirty");
    await wait(AUTOSAVE_DELAY_IN_MILLISECONDS);

    expect(commands.saveNote).toHaveBeenCalledTimes(2);
    expect(commands.saveNote).toHaveBeenLastCalledWith("n1", {
      content: "one two",
      baseHash: "h2",
      force: false,
    });
    expect(result.current.status).toBe("saved");
  });

  it("reports an error and retries with the same text", async () => {
    commands.saveNote
      .mockResolvedValueOnce({ status: "error", error: { code: "IO", message: "disk" } })
      .mockResolvedValueOnce(saved("h2"));
    const { result } = renderAutosave();

    act(() => result.current.handleChange("changed"));
    await wait(AUTOSAVE_DELAY_IN_MILLISECONDS);
    expect(result.current.status).toBe("error");
    await act(async () => {
      await result.current.saveNow();
    });

    expect(result.current.status).toBe("saved");
    expect(commands.saveNote).toHaveBeenLastCalledWith("n1", {
      content: "changed",
      baseHash: "h1",
      force: false,
    });
  });

  it("flags a conflict, stops autosaving and can overwrite with force", async () => {
    commands.saveNote
      .mockResolvedValueOnce({ status: "error", error: { code: "CONFLICT", message: "changed" } })
      .mockResolvedValueOnce(saved("h9"));
    const { result } = renderAutosave();

    act(() => result.current.handleChange("mine"));
    await wait(AUTOSAVE_DELAY_IN_MILLISECONDS);
    expect(result.current.status).toBe("conflict");
    act(() => result.current.handleChange("mine, edited again"));
    await wait(AUTOSAVE_DELAY_IN_MILLISECONDS * 2);
    expect(commands.saveNote).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.overwrite();
    });

    expect(commands.saveNote).toHaveBeenLastCalledWith("n1", {
      content: "mine, edited again",
      baseHash: "h1",
      force: true,
    });
    expect(result.current.status).toBe("saved");
  });

  it("loads the file version when the conflict is resolved by reloading", async () => {
    commands.saveNote.mockResolvedValue({
      status: "error",
      error: { code: "CONFLICT", message: "changed" },
    });
    const { result } = renderAutosave();
    act(() => result.current.handleChange("mine"));
    await wait(AUTOSAVE_DELAY_IN_MILLISECONDS);
    const versionBefore = result.current.editorVersion;

    act(() => result.current.adopt({ ...note, hash: "h5", content: "from disk" }));

    expect(result.current.status).toBe("saved");
    expect(result.current.initialContent).toBe("from disk");
    expect(result.current.editorVersion).toBe(versionBefore + 1);
  });

  it("adopts a change made outside the app while the note is clean", async () => {
    const { result, rerender } = renderAutosave();

    rerender({ current: { ...note, hash: "h7", content: "edited elsewhere" } });

    expect(result.current.initialContent).toBe("edited elsewhere");
    expect(result.current.editorVersion).toBe(1);
    expect(result.current.status).toBe("saved");
  });

  it("keeps the user's text when the file changes outside while there are unsaved edits", async () => {
    const { result, rerender } = renderAutosave();

    act(() => result.current.handleChange("mine"));
    rerender({ current: { ...note, hash: "h7", content: "edited elsewhere" } });

    expect(result.current.initialContent).toBe("# Plan");
    expect(result.current.editorVersion).toBe(0);
    expect(result.current.status).toBe("dirty");
  });

  it("saves pending changes when it unmounts", async () => {
    commands.saveNote.mockResolvedValue(saved("h2"));
    const { result, unmount } = renderAutosave();

    act(() => result.current.handleChange("pending"));
    unmount();
    await wait(0);

    expect(commands.saveNote).toHaveBeenCalledWith("n1", {
      content: "pending",
      baseHash: "h1",
      force: false,
    });
  });

  it("does not save on unmount after discarding", async () => {
    const { result, unmount } = renderAutosave();

    act(() => result.current.handleChange("pending"));
    act(() => result.current.discard());
    unmount();

    expect(commands.saveNote).not.toHaveBeenCalled();
  });
});
