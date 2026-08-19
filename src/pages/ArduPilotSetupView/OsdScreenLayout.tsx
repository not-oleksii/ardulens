import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { clampOsdX, clampOsdY, OSD_GRID_COLS, OSD_GRID_ROWS, osdElementLabel, type OsdElementKey } from "./osdSetupParams";

interface LayoutElement {
  key: OsdElementKey;
  x: number;
  y: number;
}

interface OsdScreenLayoutProps {
  elements: LayoutElement[];
  selectedKey: OsdElementKey | null;
  onSelect: (key: OsdElementKey) => void;
  onMove: (key: OsdElementKey, x: number, y: number) => void;
}

/** A Betaflight/INAV-style visual preview of the active OSD screen - a 60x22 character grid (see
 *  osdSetupParams.ts's OSD_GRID_COLS/ROWS) with one draggable chip per currently-enabled element,
 *  positioned at its real X/Y. Dragging a chip restages that element's X/Y live; a plain click
 *  (no movement) selects it instead, for use with OsdSetupSection's quick-position buttons. */
export function OsdScreenLayout({ elements, selectedKey, onSelect, onMove }: OsdScreenLayoutProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  // Tracks the in-progress drag across pointer events - a ref (not state) since pointermove
  // fires far too often to route through a re-render just to remember "which chip, did it move
  // yet" between events.
  const draggingRef = useRef<{ key: OsdElementKey; moved: boolean } | null>(null);

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>, key: OsdElementKey) {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    draggingRef.current = { key, moved: false };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const dragging = draggingRef.current;
    const container = containerRef.current;
    if (!dragging || !container) return;
    dragging.moved = true;
    const rect = container.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    onMove(dragging.key, clampOsdX(relX * (OSD_GRID_COLS - 1)), clampOsdY(relY * (OSD_GRID_ROWS - 1)));
  }

  function handlePointerUp(e: React.PointerEvent<HTMLButtonElement>, key: OsdElementKey) {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    const dragging = draggingRef.current;
    draggingRef.current = null;
    // A press-release with no measurable movement is a click, not a drag - select the element
    // rather than (no-op) "moving" it back onto itself.
    if (dragging && !dragging.moved) onSelect(key);
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full touch-none overflow-hidden rounded-md border border-border bg-slate-950"
      style={{ aspectRatio: `${OSD_GRID_COLS} / ${OSD_GRID_ROWS}` }}
    >
      {elements.map(({ key, x, y }) => (
        <button
          key={key}
          type="button"
          onPointerDown={(e) => handlePointerDown(e, key)}
          onPointerMove={handlePointerMove}
          onPointerUp={(e) => handlePointerUp(e, key)}
          title={`${osdElementLabel(t, key)} (${x}, ${y})`}
          className={cn(
            "absolute -translate-y-1/2 cursor-grab touch-none rounded-sm border px-1 py-0 text-[10px] leading-4 whitespace-nowrap text-lime-300 select-none active:cursor-grabbing",
            selectedKey === key ? "border-primary bg-primary/30 z-10" : "border-lime-400/40 bg-black/70 hover:border-lime-300",
          )}
          style={{ left: `${(x / (OSD_GRID_COLS - 1)) * 100}%`, top: `${(y / (OSD_GRID_ROWS - 1)) * 100}%` }}
        >
          {osdElementLabel(t, key)}
        </button>
      ))}
    </div>
  );
}
