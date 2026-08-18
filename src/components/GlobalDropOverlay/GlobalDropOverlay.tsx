import { useState, type DragEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useFileLoader } from "../../hooks/useFileLoader/useFileLoader";
import { getCoreWorker } from "../../services/coreWorkerClient/coreWorkerClient";
import { useFileStore } from "../../stores/fileStore/fileStore";
import { isParsedError, type ParseResult } from "../../types";

interface Validated {
  name: string;
  buf: ArrayBuffer;
  result: ParseResult;
}

/**
 * Lets a file be dropped anywhere on screen to replace the one already loaded - HomeView's
 * own FileDropzone only exists before a file is loaded, so once the user is on Logs/Graphs/
 * Map there was previously no drop target at all. Wraps the whole log-viewer layout
 * (Sidebar + active tab) rather than adding a dropzone to each page individually, since drag
 * events bubble up through the DOM to this outer element regardless of which child they
 * start on. Reuses the exact same validate-then-load pipeline HomeView uses (via
 * useFileLoader + parseFile), so a bad file is rejected identically in both places.
 */
export function GlobalDropOverlay({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const setFile = useFileStore((s) => s.setFile);
  const [error, setError] = useState<string | null>(null);
  // dragenter/dragleave fire on every nested child element too (they bubble), not just the
  // outer wrapper - a plain boolean flickers off/on as the pointer crosses child element
  // boundaries while dragging. Counting enter/leave pairs and only hiding the overlay once
  // the count returns to zero is the standard fix.
  const [dragDepth, setDragDepth] = useState(0);
  const isDragging = dragDepth > 0;

  const { isParsing, stage, load } = useFileLoader<Validated>(async (name, buf) => {
    try {
      const result = await getCoreWorker().parseFile(name, buf);
      return { name, buf, result };
    } catch (err) {
      return {
        name,
        buf,
        result: { error: t("logs.messages.parseError", { message: err instanceof Error ? err.message : String(err) }) },
      };
    }
  });

  function handleFile(file: File) {
    void load(file).then(({ name, buf, result }) => {
      if (isParsedError(result)) {
        setError(result.error);
        return;
      }
      setError(null);
      setFile({ name, buf });
    });
  }

  function onDragEnter(e: DragEvent) {
    e.preventDefault();
    setDragDepth((d) => d + 1);
  }

  function onDragLeave(e: DragEvent) {
    e.preventDefault();
    setDragDepth((d) => Math.max(0, d - 1));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragDepth(0);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div
      data-testid="global-drop-zone"
      className="relative h-svh overflow-hidden"
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {children}

      {(isDragging || isParsing) && (
        <div
          data-testid="global-drop-overlay"
          className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center border-4 border-dashed border-primary bg-background/90"
        >
          <p className="text-lg font-semibold">
            {isParsing
              ? stage === "reading"
                ? t("home.drop.reading")
                : t("home.drop.parsing")
              : t("home.drop.replaceHint")}
          </p>
        </div>
      )}

      {error && (
        <div className="absolute inset-x-0 top-4 z-50 mx-auto max-w-md px-4">
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  );
}
