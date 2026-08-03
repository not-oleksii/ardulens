export interface LoadedFile {
  name: string;
  buf: ArrayBuffer;
}

export interface FileState {
  file: LoadedFile | null;
  setFile: (file: LoadedFile) => void;
  clearFile: () => void;
}
