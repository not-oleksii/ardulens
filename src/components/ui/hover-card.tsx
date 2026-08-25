import * as HoverCardPrimitive from "@radix-ui/react-hover-card";
import type * as React from "react";
import { cn } from "@/lib/utils";

function HoverCard({ ...props }: React.ComponentProps<typeof HoverCardPrimitive.Root>) {
  return <HoverCardPrimitive.Root data-slot="hover-card" openDelay={200} closeDelay={100} {...props} />;
}

function HoverCardTrigger({ ...props }: React.ComponentProps<typeof HoverCardPrimitive.Trigger>) {
  return <HoverCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />;
}

function HoverCardContent({
  className,
  align = "start",
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Content>) {
  return (
    <HoverCardPrimitive.Portal>
      <HoverCardPrimitive.Content
        data-slot="hover-card-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "ardulens-glass z-50 w-72 rounded-md border p-3 text-sm text-card-foreground shadow-md outline-none",
          "data-[state=open]:animate-[ardulens-pop-in_var(--ardulens-motion-fast)_var(--ardulens-ease-out)]",
          "data-[state=closed]:animate-[ardulens-pop-out_var(--ardulens-motion-fast)_var(--ardulens-ease-out)]",
          className,
        )}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  );
}

export { HoverCard, HoverCardTrigger, HoverCardContent };
