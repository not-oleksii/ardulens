import type * as React from "react";
import { cn } from "@/lib/utils";

/** `glass` is opt-in, not the default: Card is this app's primary page-shell container (every
 *  page wraps its content in one), not an overlay - defaulting it to a translucent surface
 *  would change the baseline look of every existing page at once. Use it deliberately for a
 *  card that genuinely floats over other content (e.g. an elevated panel over the map). */
function Card({ className, glass = false, ...props }: React.ComponentProps<"div"> & { glass?: boolean }) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col gap-4 rounded-lg border p-5 text-card-foreground",
        glass ? "ardulens-glass" : "border-border bg-card",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2 data-slot="card-title" className={cn("text-xl leading-none font-medium", className)} {...props} />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p data-slot="card-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("text-sm", className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent };
