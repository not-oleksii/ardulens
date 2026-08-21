import * as TabsPrimitive from "@radix-ui/react-tabs";
import type * as React from "react";
import { cn } from "@/lib/utils";

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex w-fit items-center gap-1 border-b border-border",
        "data-[orientation=vertical]:w-full data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch data-[orientation=vertical]:border-b-0 data-[orientation=vertical]:gap-1",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-t-sm border-b-[3px] border-transparent px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors",
        "hover:text-foreground",
        "disabled:pointer-events-none disabled:opacity-50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        // Bold weight and a filled background, not just the border color swap - Tailwind's own
        // Preflight ("* { border-color: var(--border) }") beats the border-color utility here for
        // reasons that didn't resolve even with an explicit !important, so a background highlight
        // (the same mechanism the vertical/sidebar variant below already uses successfully) is
        // the reliable "which tab is selected" signal; the border utilities stay as a bonus for
        // whichever build config does render them correctly.
        "data-[state=active]:border-primary data-[state=active]:bg-accent data-[state=active]:font-semibold data-[state=active]:text-foreground",
        "data-[orientation=vertical]:justify-start data-[orientation=vertical]:rounded-md data-[orientation=vertical]:border-b-0 data-[orientation=vertical]:px-3",
        "data-[orientation=vertical]:data-[state=active]:bg-secondary",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
