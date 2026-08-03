import type { FileLoaderStage } from "../../hooks/useFileLoader/useFileLoader";

export interface FileDropzoneProps {
  /** Base id for the dropzone/input, e.g. "log" -> data-testid="log-dropzone"/"log-file-input". */
  testId: string;
  accept: string;
  isParsing: boolean;
  stage: FileLoaderStage;
  onFile: (file: File) => void;
  title: string;
  subtitle: string;
  readingText: string;
  parsingText: string;
}
