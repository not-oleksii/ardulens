import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

/** A small colored-dot status pill - the one shared severity indicator for arm state, EKF/vibe
 *  health, GPS fix quality, connection status, and advisor findings, replacing the ad hoc
 *  per-file `text-amber-400`/`bg-sky-500`/etc. spans this app previously hand-rolled in each
 *  section. Semantic color only - never repurposed as a general accent. */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        good: "bg-ardulens-status-good/15 text-ardulens-status-good",
        warning: "bg-ardulens-status-warning/15 text-ardulens-status-warning",
        critical: "bg-destructive/15 text-destructive",
        info: "bg-ardulens-status-info/15 text-ardulens-status-info",
        neutral: "bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

const dotVariants = {
  good: "bg-ardulens-status-good",
  warning: "bg-ardulens-status-warning",
  critical: "bg-destructive",
  info: "bg-ardulens-status-info",
  neutral: "bg-muted-foreground",
} as const;

function Badge({
  className,
  variant,
  dot = true,
  children,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { dot?: boolean }) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", dotVariants[variant ?? "neutral"])} />}
      {children}
    </span>
  );
}

export { Badge };
