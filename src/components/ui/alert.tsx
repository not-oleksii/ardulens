import { cva, type VariantProps } from "class-variance-authority";
import { CheckCircle2, Info, OctagonAlert, TriangleAlert } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-lg border px-4 py-3 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground border-border",
        destructive: "text-destructive bg-destructive/10 border-destructive/30 [&>svg]:text-destructive",
        good: "border-ardulens-status-good/30 bg-ardulens-status-good/10 text-ardulens-status-good [&>svg]:text-ardulens-status-good",
        info: "border-ardulens-status-info/30 bg-ardulens-status-info/10 text-ardulens-status-info [&>svg]:text-ardulens-status-info",
        warning:
          "border-ardulens-status-warning/30 bg-ardulens-status-warning/10 text-ardulens-status-warning [&>svg]:text-ardulens-status-warning",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

// Each semantic variant gets its own outlined lucide icon (lucide's whole set is stroke-based,
// never filled) so severity reads from SHAPE as well as color - an octagon for destructive
// specifically reads as "stop" even before the red registers, distinct from warning's triangle
// and info's circle. "default" (neutral) intentionally has no auto-icon - it's a plain banner,
// not a severity signal. Callers can still pass their own icon child to override this.
const VARIANT_ICON = {
  destructive: OctagonAlert,
  good: CheckCircle2,
  info: Info,
  warning: TriangleAlert,
} as const;

function Alert({
  className,
  variant,
  children,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  const AutoIcon = variant && variant in VARIANT_ICON ? VARIANT_ICON[variant as keyof typeof VARIANT_ICON] : null;
  const hasExplicitIcon = React.Children.toArray(children).some(
    (child) => React.isValidElement(child) && child.type !== AlertTitle && child.type !== AlertDescription,
  );
  return (
    <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props}>
      {!hasExplicitIcon && AutoIcon && <AutoIcon aria-hidden />}
      {children}
    </div>
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("col-start-2 min-h-4 font-medium tracking-tight", className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("text-muted-foreground col-start-2 grid justify-items-start gap-1 text-sm", className)}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription };
