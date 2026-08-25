export type ToastVariant = "good" | "warning" | "critical" | "info";

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  title?: string;
  description: string;
  /** ms before auto-dismiss; Infinity to require an explicit close. */
  duration: number;
}

export interface ToastState {
  toasts: ToastItem[];
  push: (item: Omit<ToastItem, "id" | "duration"> & { duration?: number }) => string;
  dismiss: (id: string) => void;
}
