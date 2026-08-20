import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  ANALOG_SAFE_COLS,
  ANALOG_SAFE_ROWS_NTSC,
  ANALOG_SAFE_ROWS_PAL,
  clampOsdX,
  clampOsdY,
  OSD_GRID_COLS,
  OSD_GRID_ROWS,
  osdElementLabel,
  osdPreviewKind,
  osdVisibleSafeArea,
  type OsdElementKey,
} from "./osdSetupParams";

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
  osdType: number | undefined;
  txtRes: number | undefined;
}

// Half a chip's own rendered height (~18-20px with the current text-xs/leading-4 styling) - the
// inner grid area below is inset by this many px top and bottom so a chip vertically centered
// (via -translate-y-1/2) on row 0 or the last row stays fully inside the visible box instead of
// poking out past its border. CSS percentages on an absolutely-positioned child resolve against
// its containing block's padding edge, which sits flush with the border - adding padding to the
// outer bordered box does NOT create this margin, only reserving it on a separate inner
// positioned wrapper does.
const CHIP_VERTICAL_INSET_PX = 10;

/** A visual preview of the active OSD screen - a character grid (see
 *  osdSetupParams.ts's OSD_GRID_COLS/ROWS, the real 0-59/0-21 range every X/Y param accepts) with
 *  one draggable chip per currently-enabled element, positioned at its real X/Y. Dragging a chip
 *  restages that element's X/Y live; a plain click (no movement) selects it instead, for use with
 *  OsdSetupSection's quick-position buttons.
 *
 *  Renders actual grid lines (not a blank box) so the preview reads as a character grid rather
 *  than an empty rectangle, and overlays the real visible area when it's confidently known (see
 *  osdVisibleSafeArea) - analog MAX7456's ~30x13-16 hardware limit, or a digital MSP DisplayPort
 *  screen's 50x18 HD canvas (OSD{n}_TXT_RES=1) - since the parameter range itself (60x22) is
 *  wider than either actually displays. Chips anchor from whichever horizontal edge they're
 *  closer to (left half grows rightward, right half grows leftward) so a chip near column 59
 *  never has to render past the container's right border.
 *
 *  Selecting an element - by clicking its chip, clicking its row in OsdSetupSection's table, or
 *  Tab-ing to it - always moves real DOM focus onto its chip (see the selectedKey effect below),
 *  not just visual state. That's what makes arrow-key nudging and "select via the table instead"
 *  both work uniformly, including for a chip another one is fully stacked on top of and can't be
 *  clicked directly - the table's row click still reaches it and pulls it to the front (z-10) and
 *  into keyboard focus without ever needing a working click target on the canvas itself. */
export function OsdScreenLayout({ elements, selectedKey, onSelect, onMove, osdType, txtRes }: OsdScreenLayoutProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef(new Map<OsdElementKey, HTMLButtonElement>());
  // Tracks the in-progress drag across pointer events - a ref (not state) since pointermove
  // fires far too often to route through a re-render just to remember "which chip, did it move
  // yet" between events.
  const draggingRef = useRef<{ key: OsdElementKey; moved: boolean } | null>(null);

  useEffect(() => {
    if (!selectedKey) return;
    const chip = chipRefs.current.get(selectedKey);
    // Only steal focus if it isn't already elsewhere on the chip itself (e.g. mid-drag) - a
    // table-row click (which doesn't move DOM focus on its own) is exactly the case this exists
    // to cover.
    if (chip && document.activeElement !== chip) chip.focus({ preventScroll: true });
  }, [selectedKey]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, key: OsdElementKey, x: number, y: number) {
    const deltas: Partial<Record<string, [number, number]>> = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    const delta = deltas[e.key];
    if (!delta) return;
    e.preventDefault();
    const step = e.shiftKey ? 5 : 1;
    onMove(key, clampOsdX(x + delta[0] * step), clampOsdY(y + delta[1] * step));
  }

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

  const previewKind = osdPreviewKind(osdType);
  const safeArea = osdVisibleSafeArea(osdType, txtRes);
  // A confidently-known visible area has a noticeably different aspect ratio than the full
  // 60x22 parameter range - rendering at that shape (rather than always the wide 60x22 box) is
  // what makes the preview actually look like the real display it represents, instead of a
  // generic wide canvas regardless of hardware.
  const aspectRatio = safeArea ? `${safeArea.cols} / ${safeArea.rows}` : `${OSD_GRID_COLS} / ${OSD_GRID_ROWS}`;
  const badgeKey =
    previewKind === "analog"
      ? "previewBadgeAnalog"
      : previewKind === "digital"
        ? safeArea
          ? "previewBadgeDigitalHd"
          : "previewBadgeDigital"
        : "previewBadgeGeneric";

  return (
    <div
      className="relative w-full touch-none overflow-hidden rounded-md border border-border bg-slate-950"
      style={{
        aspectRatio,
        backgroundImage:
          "linear-gradient(to right, rgb(148 163 184 / 0.12) 1px, transparent 1px), linear-gradient(to bottom, rgb(148 163 184 / 0.12) 1px, transparent 1px)",
        backgroundSize: `${100 / OSD_GRID_COLS}% ${100 / OSD_GRID_ROWS}%`,
      }}
    >
      <span className="absolute top-1 left-1.5 z-20 rounded-sm bg-black/60 px-1 py-0.5 text-[10px] font-semibold tracking-wide text-slate-300 uppercase">
        {t(`ardupilotSetup.osdSetup.${badgeKey}`)}
      </span>

      {previewKind === "analog" && (
        <>
          {/* NTSC bound (13 rows) - text inside this box is guaranteed visible on either video
              standard, since it's the smaller of the two. Solid, since it's the safe guarantee. */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 border-b border-dashed border-amber-400/50"
            style={{ width: `${(ANALOG_SAFE_COLS / OSD_GRID_COLS) * 100}%`, height: `${(ANALOG_SAFE_ROWS_NTSC / OSD_GRID_ROWS) * 100}%` }}
            title={t("ardupilotSetup.osdSetup.previewSafeAreaNtsc")}
          />
          {/* PAL bound (16 rows) - only reachable on PAL hardware; still inside the 30-column
              limit every analog standard shares, so only the extra rows get their own outline. */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 border border-dashed border-amber-400/30"
            style={{ width: `${(ANALOG_SAFE_COLS / OSD_GRID_COLS) * 100}%`, height: `${(ANALOG_SAFE_ROWS_PAL / OSD_GRID_ROWS) * 100}%` }}
            title={t("ardupilotSetup.osdSetup.previewSafeAreaPal")}
          />
        </>
      )}

      {previewKind === "digital" && safeArea && (
        // A single boundary (unlike analog's NTSC/PAL pair) - digital HD text res has one real
        // size (see osdVisibleSafeArea).
        <div
          className="pointer-events-none absolute inset-x-0 top-0 border border-dashed border-amber-400/40"
          style={{ width: `${(safeArea.cols / OSD_GRID_COLS) * 100}%`, height: `${(safeArea.rows / OSD_GRID_ROWS) * 100}%` }}
          title={t("ardupilotSetup.osdSetup.previewSafeAreaDigitalHd")}
        />
      )}

      {/* Chips are positioned (and drag math is computed) relative to THIS inner box, not the
          outer bordered one - it's inset top/bottom by CHIP_VERTICAL_INSET_PX so row 0 and the
          last row have real room for a vertically-centered chip without poking past the border. */}
      <div ref={containerRef} className="absolute inset-x-0" style={{ top: CHIP_VERTICAL_INSET_PX, bottom: CHIP_VERTICAL_INSET_PX }}>
        {elements.map(({ key, x, y }) => {
          // A chip past the grid's horizontal midpoint anchors from the right and grows text
          // leftward instead of rightward - otherwise a chip near column 59 would need to render
          // its label past the container's own right edge, which used to force a horizontal
          // scrollbar on this panel (overflow-hidden above stops that, but would silently clip
          // the label instead without this flip).
          const fromRight = x > (OSD_GRID_COLS - 1) / 2;
          const positionStyle = fromRight
            ? { right: `${100 - (x / (OSD_GRID_COLS - 1)) * 100}%` }
            : { left: `${(x / (OSD_GRID_COLS - 1)) * 100}%` };
          return (
            <button
              key={key}
              ref={(el) => {
                if (el) chipRefs.current.set(key, el);
                else chipRefs.current.delete(key);
              }}
              type="button"
              onPointerDown={(e) => handlePointerDown(e, key)}
              onPointerMove={handlePointerMove}
              onPointerUp={(e) => handlePointerUp(e, key)}
              onKeyDown={(e) => handleKeyDown(e, key, x, y)}
              onFocus={() => onSelect(key)}
              title={`${osdElementLabel(t, key)} (${x}, ${y})`}
              className={cn(
                // font-osd (Share Tech Mono) instead of the app's normal UI font - real OSD
                // hardware (MAX7456, digital canvas systems, Walksnail/HD digital) all render a
                // bold, blocky, high-contrast monospace, not a regular UI typeface, so matching
                // grid/resolution alone would still look wrong.
                "absolute max-w-[calc(100%-4px)] -translate-y-1/2 cursor-grab touch-none rounded-sm border px-1 py-0 font-osd text-xs leading-4 overflow-hidden text-ellipsis whitespace-nowrap text-lime-300 uppercase select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing",
                selectedKey === key ? "border-primary bg-primary/30 z-10" : "border-lime-400/40 bg-black/70 hover:border-lime-300",
              )}
              style={{ ...positionStyle, top: `${(y / (OSD_GRID_ROWS - 1)) * 100}%` }}
            >
              {osdElementLabel(t, key)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
