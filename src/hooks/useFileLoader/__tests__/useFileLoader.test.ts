import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useFileLoader } from "../useFileLoader";

describe("useFileLoader", () => {
  it("starts idle", () => {
    const { result } = renderHook(() => useFileLoader(() => Promise.resolve("ok")));
    expect(result.current.isParsing).toBe(false);
    expect(result.current.stage).toBeNull();
  });

  it("loadBuffer resolves with the parser's result and resets state afterward", async () => {
    const parse = vi.fn((name: string) => Promise.resolve(`parsed:${name}`));
    const { result } = renderHook(() => useFileLoader(parse));

    let value: string | undefined;
    await act(async () => {
      value = await result.current.loadBuffer("a.bin", new ArrayBuffer(0));
    });

    expect(value).toBe("parsed:a.bin");
    expect(result.current.isParsing).toBe(false);
    expect(result.current.stage).toBeNull();
    expect(parse).toHaveBeenCalledWith("a.bin", expect.any(ArrayBuffer), undefined);
  });

  it("sets stage to 'reading' synchronously when load() is called, before the file is read", () => {
    const parse = vi.fn((name: string) => Promise.resolve(`parsed:${name}`));
    const { result } = renderHook(() => useFileLoader(parse));
    const file = new File(["hello"], "b.bin");

    act(() => {
      void result.current.load(file);
    });

    expect(result.current.isParsing).toBe(true);
    expect(result.current.stage).toBe("reading");
  });

  it("load() resolves with the parsed result and resets state afterward", async () => {
    const parse = vi.fn((name: string) => Promise.resolve(`parsed:${name}`));
    const { result } = renderHook(() => useFileLoader(parse));
    const file = new File(["hello"], "b.bin");

    let value: string | undefined;
    await act(async () => {
      value = await result.current.load(file);
    });

    expect(value).toBe("parsed:b.bin");
    expect(result.current.isParsing).toBe(false);
    expect(result.current.stage).toBeNull();
  });

  it("threads an optional Extra argument through to parse", async () => {
    const parse = vi.fn((name: string, _buf: ArrayBuffer, extra?: string) => Promise.resolve(`${name}:${extra ?? "none"}`));
    const { result } = renderHook(() => useFileLoader<string, string>(parse));

    let value: string | undefined;
    await act(async () => {
      value = await result.current.loadBuffer("a.bin", new ArrayBuffer(0), "override");
    });

    expect(value).toBe("a.bin:override");
    expect(parse).toHaveBeenCalledWith("a.bin", expect.any(ArrayBuffer), "override");
  });

  it("resets isParsing/stage even when parse throws", async () => {
    const { result } = renderHook(() => useFileLoader(() => Promise.reject(new Error("boom"))));

    await act(async () => {
      await expect(result.current.loadBuffer("a.bin", new ArrayBuffer(0))).rejects.toThrow("boom");
    });
    expect(result.current.isParsing).toBe(false);
    expect(result.current.stage).toBeNull();
  });
});
