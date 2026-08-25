import { cva, type VariantProps } from "class-variance-authority";
import { CheckCircle2, Info, OctagonAlert, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** A plain state machine rather than @radix-ui/react-toast: this app only needs enter/auto-
 *  dismiss/close-button/pause-on-hover, all of which are simple to own directly, and it mirrors
 *  the same enter/leave-with-delayed-unmount technique Drawer.tsx already uses successfully -
 *  one fewer dependency, one less set of library internals to reason about. */

const toastVariants = cva(
  "ardulens-glass pointer-events-auto relative grid w-full grid-cols-[auto_1fr_auto] items-start gap-3 rounded-lg border p-4 pr-8 shadow-lg transition-all duration-[var(--ardulens-motion-base)] ease-out [&>svg]:mt-0.5 [&>svg]:size-4",
  {
    variants: {
      variant: {
        default: "text-card-foreground [&>svg]:text-muted-foreground",
        good: "text-ardulens-status-good [&>svg]:text-ardulens-status-good",
        warning: "text-ardulens-status-warning [&>svg]:text-ardulens-status-warning",
        critical: "text-destructive [&>svg]:text-destructive",
        info: "text-ardulens-status-info [&>svg]:text-ardulens-status-info",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

const VARIANT_ICON = {
  critical: OctagonAlert,
  good: CheckCircle2,
  info: Info,
  warning: TriangleAlert,
} as const;

export type ToastRootVariant = NonNullable<VariantProps<typeof toastVariants>["variant"]>;

const EXIT_MS = 150; // must be <= the transition duration above, so the leave state is visible

export interface ToastProps {
  variant?: ToastRootVariant;
  title?: string;
  description: string;
  duration: number;
  onDismiss: () => void;
}

/** One toast - owns its own enter/leave transition state; calls `onDismiss` (removes it from
 *  the store) only after the leave transition has had time to play. */
export function Toast({ variant = "default", title, description, duration, onDismiss }: ToastProps) {
  const [phase, setPhase] = useState<"entering" | "open" | "leaving">("entering");
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setPhase("open"));
    return () => cancelAnimationFrame(raf);
  }, []);

  const startLeave = () => {
    setPhase("leaving");
    dismissTimerRef.current = setTimeout(onDismiss, EXIT_MS);
  };

  useEffect(() => {
    if (duration === Infinity) return;
    autoCloseTimerRef.current = setTimeout(startLeave, duration);
    return () => clearTimeout(autoCloseTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- startLeave is stable enough here; re-running on every render would restart the timer
  }, [duration]);

  useEffect(() => () => clearTimeout(dismissTimerRef.current), []);

  const Icon = VARIANT_ICON[variant as keyof typeof VARIANT_ICON] as typeof CheckCircle2 | undefined;

  return (
    <div
      data-slot="toast"
      role="status"
      aria-live={variant === "critical" ? "assertive" : "polite"}
      className={toastVariants({ variant })}
      style={{
        transform: phase === "open" ? "translateX(0)" : "translateX(calc(100% + 24px))",
        opacity: phase === "open" ? 1 : 0,
      }}
      onMouseEnter={() => clearTimeout(autoCloseTimerRef.current)}
      onMouseLeave={() => {
        if (duration !== Infinity && phase === "open") autoCloseTimerRef.current = setTimeout(startLeave, duration);
      }}
    >
      {Icon && <Icon aria-hidden />}
      <div className="flex flex-col gap-1">
        {title && <p className="text-sm font-semibold">{title}</p>}
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        aria-label="Close"
        onClick={startLeave}
        className="absolute top-3 right-3 rounded-xs opacity-70 outline-none transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function ToastViewport({ children }: { children: ReactNode }) {
  return (
    <div
      data-slot="toast-viewport"
      className="pointer-events-none fixed right-0 bottom-0 z-[100] flex w-full max-w-sm flex-col gap-2 p-4"
    >
      {children}
    </div>
  );
}
