import { ChevronUp } from "lucide-react";
import { createContext, useContext, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A bottom-sheet-style drawer that slides over its container rather than pushing content
 *  around it - generalizes the technique proven in MissionPlanSection.tsx's own map drawer
 *  (always mounted, translated out of view except for its handle when collapsed, via a plain
 *  inline `transform` rather than a Tailwind translate-y-[...] utility - Tailwind v4's
 *  translate-y-* utilities resolve through --tw-translate-y feeding the standalone `translate`
 *  property, which wasn't taking visible effect through that path when checked directly; a
 *  plain `transform` sidesteps it and is covered by transition-transform just as well). Not
 *  built on Radix Dialog: a drawer here is a persistent panel over its own container (e.g. a
 *  map), not a focus-trapped modal blocking the rest of the page. */

interface DrawerContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DrawerContext = createContext<DrawerContextValue | null>(null);

function useDrawerContext(): DrawerContextValue {
  const ctx = useContext(DrawerContext);
  if (!ctx) throw new Error("Drawer.* components must be rendered inside <Drawer>");
  return ctx;
}

function Drawer({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  children,
}: {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  return <DrawerContext.Provider value={{ open, setOpen }}>{children}</DrawerContext.Provider>;
}

/** The always-visible handle bar - click to toggle. Renders its own chevron; pass the label as
 *  children (e.g. a translated "Waypoints (3)" string). */
function DrawerTrigger({ className, children, ...props }: React.ComponentProps<"button">) {
  const { open, setOpen } = useDrawerContext();
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      className={cn(
        "flex h-11 shrink-0 items-center justify-between gap-2 rounded-t-lg px-3 py-2.5 text-xs font-bold tracking-wide uppercase transition-colors hover:bg-accent",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronUp
        aria-hidden
        className={cn(
          "size-4 shrink-0 transition-transform duration-[var(--ardulens-motion-base)]",
          open ? "rotate-0" : "rotate-180",
        )}
      />
    </button>
  );
}

/** The sliding panel itself. `maxHeight` caps how tall it grows when open (percentage or any
 *  CSS length) - defaults to the map-drawer precedent's 55%. */
function DrawerContent({
  className,
  style,
  maxHeight = "55%",
  glass = false,
  children,
  ...props
}: React.ComponentProps<"div"> & { maxHeight?: string; glass?: boolean }) {
  const { open } = useDrawerContext();
  return (
    <div
      className={cn(
        "absolute inset-x-0 bottom-0 z-10 flex flex-col rounded-t-lg border shadow-lg transition-transform duration-[var(--ardulens-motion-slow)] ease-out",
        glass ? "ardulens-glass" : "border-border bg-card",
        className,
      )}
      style={{
        maxHeight,
        transform: open ? "translateY(0)" : "translateY(calc(100% - 2.75rem))",
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export { Drawer, DrawerTrigger, DrawerContent };
