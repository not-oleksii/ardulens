import { useState } from "react";

export type FileLoaderStage = "reading" | "parsing" | null;

/**
 * Shared "drop/select a file, read it, hand the buffer to a parser" state machine used by
 * every page with a file dropzone (Logs/Graphs/Map) - each page still supplies its own
 * `parse` (they each derive a different view-model from the same buffer, some combining
 * several worker calls), but the reading/parsing progress state and the load()/
 * loadBuffer() entry points are otherwise identical. `Extra` lets a caller thread one extra
 * argument through to `parse` (e.g. LogsView's board-filter override for its sample
 * button) - callers that don't need it can just omit it.
 */
export function useFileLoader<T, Extra = undefined>(parse: (name: string, buf: ArrayBuffer, extra?: Extra) => Promise<T>) {
  const [isParsing, setIsParsing] = useState(false);
  const [stage, setStage] = useState<FileLoaderStage>(null);

  async function loadBuffer(name: string, buf: ArrayBuffer, extra?: Extra): Promise<T> {
    setIsParsing(true);
    setStage("parsing");
    try {
      return await parse(name, buf, extra);
    } finally {
      setIsParsing(false);
      setStage(null);
    }
  }

  async function load(file: File, extra?: Extra): Promise<T> {
    setIsParsing(true);
    setStage("reading");
    const buf = await file.arrayBuffer();
    setStage("parsing");
    try {
      return await parse(file.name, buf, extra);
    } finally {
      setIsParsing(false);
      setStage(null);
    }
  }

  return { isParsing, stage, load, loadBuffer };
}
