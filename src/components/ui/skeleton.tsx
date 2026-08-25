import type * as React from "react";
import { cn } from "@/lib/utils";

/** A pulsing placeholder for content that's still loading - use in place of plain "loading..."
 *  text wherever the eventual content's shape (a table row, a card, a readout) is known ahead
 *  of time, so the layout doesn't jump once real content arrives. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
