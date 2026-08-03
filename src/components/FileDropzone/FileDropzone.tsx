import { Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { FileDropzoneProps } from "./types";

/**
 * Shared drag-and-drop + click-to-browse file target used by every page with a file
 * upload (Logs/Graphs/Map) - previously each page hand-rolled its own copy of this exact
 * markup/drag handling. Reading/parsing progress state lives in the caller (via
 * useFileLoader), since sample-flight buttons also need to disable/show progress and
 * aren't routed through this component at all.
 */
export function FileDropzone({
  testId,
  accept,
  isParsing,
  stage,
  onFile,
  title,
  subtitle,
  readingText,
  parsingText,
}: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <div
        role="button"
        aria-disabled={isParsing}
        tabIndex={isParsing ? -1 : 0}
        data-testid={`${testId}-dropzone`}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) onFile(file);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed px-6 py-9 text-center transition-colors",
          isParsing && "pointer-events-none opacity-60",
          isDragging ? "border-primary bg-accent" : "border-border bg-card hover:border-primary hover:bg-accent",
        )}
      >
        {isParsing ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
            <span className="font-semibold">{stage === "reading" ? readingText : parsingText}</span>
          </>
        ) : (
          <>
            <span className="font-semibold">{title}</span>
            <span className="text-sm text-muted-foreground">{subtitle}</span>
          </>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        className="sr-only"
        data-testid={`${testId}-file-input`}
        disabled={isParsing}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </>
  );
}
