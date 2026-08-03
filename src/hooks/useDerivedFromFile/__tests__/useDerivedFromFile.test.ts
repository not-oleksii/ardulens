import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LoadedFile } from "../../../stores/fileStore/types";
import { useDerivedFromFile } from "../useDerivedFromFile";

describe("useDerivedFromFile", () => {
  it("stays idle with no data while there's no file", () => {
    const { result } = renderHook(() => useDerivedFromFile<string>(null, () => Promise.resolve("ok")));
    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("derives data from the file and reports loading in between", async () => {
    const file: LoadedFile = { name: "a.bin", buf: new ArrayBuffer(0) };
    const parse = vi.fn((name: string) => Promise.resolve(`parsed:${name}`));
    const { result } = renderHook(() => useDerivedFromFile(file, parse));

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toBe("parsed:a.bin");
    expect(parse).toHaveBeenCalledWith("a.bin", file.buf);
  });

  it("re-derives when the file changes", async () => {
    const fileA: LoadedFile = { name: "a.bin", buf: new ArrayBuffer(0) };
    const fileB: LoadedFile = { name: "b.bin", buf: new ArrayBuffer(0) };
    const parse = (name: string) => Promise.resolve(`parsed:${name}`);
    const { result, rerender } = renderHook(({ file }) => useDerivedFromFile(file, parse), {
      initialProps: { file: fileA },
    });
    await waitFor(() => expect(result.current.data).toBe("parsed:a.bin"));

    rerender({ file: fileB });

    await waitFor(() => expect(result.current.data).toBe("parsed:b.bin"));
  });

  it("resets to null when the file is cleared", async () => {
    const file: LoadedFile | null = { name: "a.bin", buf: new ArrayBuffer(0) };
    const parse = (name: string) => Promise.resolve(`parsed:${name}`);
    const { result, rerender } = renderHook<{ data: string | null; isLoading: boolean }, { file: LoadedFile | null }>(
      ({ file }) => useDerivedFromFile(file, parse),
      { initialProps: { file } },
    );
    await waitFor(() => expect(result.current.data).toBe("parsed:a.bin"));

    rerender({ file: null });

    expect(result.current.data).toBeNull();
  });

  it("doesn't re-run when only the parse callback's identity changes (same file)", async () => {
    const file: LoadedFile = { name: "a.bin", buf: new ArrayBuffer(0) };
    const parseA = vi.fn((name: string) => Promise.resolve(`A:${name}`));
    const parseB = vi.fn((name: string) => Promise.resolve(`B:${name}`));
    const { result, rerender } = renderHook(({ parse }) => useDerivedFromFile(file, parse), {
      initialProps: { parse: parseA },
    });
    await waitFor(() => expect(result.current.data).toBe("A:a.bin"));

    rerender({ parse: parseB });
    await Promise.resolve(); // flush any pending microtasks

    expect(parseB).not.toHaveBeenCalled();
    expect(result.current.data).toBe("A:a.bin");
  });

  it("ignores a stale result if the file changes again before the first parse resolves", async () => {
    let resolveFirst!: (value: string) => void;
    const first = new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });
    const fileA: LoadedFile = { name: "a.bin", buf: new ArrayBuffer(0) };
    const fileB: LoadedFile = { name: "b.bin", buf: new ArrayBuffer(0) };
    const parse = vi.fn((name: string) => (name === "a.bin" ? first : Promise.resolve("parsed:b.bin")));
    const { result, rerender } = renderHook(({ file }) => useDerivedFromFile(file, parse), {
      initialProps: { file: fileA },
    });

    rerender({ file: fileB });
    await waitFor(() => expect(result.current.data).toBe("parsed:b.bin"));

    await act(() => {
      resolveFirst("parsed:a.bin"); // resolves late, after fileB already won
      return Promise.resolve(); // let the (now-cancelled) .then callback run and no-op
    });

    expect(result.current.data).toBe("parsed:b.bin");
  });
});
