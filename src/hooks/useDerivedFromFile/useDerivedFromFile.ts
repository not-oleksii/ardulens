import { useEffect, useRef, useState } from "react";
import type { LoadedFile } from "../../stores/fileStore/types";

/**
 * Lazily derives a page's own view-model from the shared file (see fileStore) whenever it
 * changes - each page still calls its own worker method(s) and shapes its own result type,
 * this just handles the "re-run when the file changes, ignore stale results" plumbing once
 * instead of three times.
 *
 * `parse` is read through a ref (updated in its own effect, never during render or inside
 * the derivation effect below - this repo's react-hooks lint rules forbid both) rather than
 * listed as a dependency of the derivation effect: callers pass a fresh closure every
 * render, and depending on it directly would re-run - and therefore re-parse - on every
 * render instead of only when `file` itself changes.
 *
 * `data`/`isLoading` are derived by comparing `file` against the file the last resolved
 * result belongs to, rather than toggled with an explicit "start loading" setState call in
 * the effect body - this repo's react-hooks lint rules flag synchronous setState calls in
 * an effect even when they're just marking a fetch as started, so a comparison-based
 * derivation is used instead (and turns out to also correctly show "loading" again the
 * instant `file` changes, before the new derivation has even resolved).
 */
export function useDerivedFromFile<T>(
  file: LoadedFile | null,
  parse: (name: string, buf: ArrayBuffer) => Promise<T>,
): { data: T | null; isLoading: boolean } {
  const [resolved, setResolved] = useState<{ file: LoadedFile; data: T } | null>(null);
  const parseRef = useRef(parse);
  useEffect(() => {
    parseRef.current = parse;
  }, [parse]);

  useEffect(() => {
    if (!file) return;

    let cancelled = false;
    void parseRef.current(file.name, file.buf).then((data) => {
      if (cancelled) return;
      setResolved({ file, data });
    });

    return () => {
      cancelled = true;
    };
  }, [file]);

  const data = file && resolved && resolved.file === file ? resolved.data : null;
  const isLoading = file !== null && data === null;

  return { data, isLoading };
}
