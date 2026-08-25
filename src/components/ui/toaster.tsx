import { Toast, ToastViewport } from "@/components/ui/toast";
import { useToastStore } from "@/stores/toastStore/toastStore";

/** Mounted once at the app root (see App.tsx) - renders whatever's currently in
 *  useToastStore, regardless of which route/page pushed it. Call the `toast()` helper
 *  (stores/toastStore/toastStore.ts) from anywhere to show one. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <ToastViewport>
      {toasts.map(({ id, variant, title, description, duration }) => (
        <Toast
          key={id}
          variant={variant}
          title={title}
          description={description}
          duration={duration}
          onDismiss={() => dismiss(id)}
        />
      ))}
    </ToastViewport>
  );
}
