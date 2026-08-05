import { useRef, useState } from "react";
import { projectCoverageSphere } from "./compassCoverageSphereMath";

interface CompassCoverageSphereProps {
  completionMask: readonly number[];
  completionPct: number;
  size?: number;
}

const RADIUS_RATIO = 0.42;
const DEFAULT_SIZE = 220;

/**
 * A drag-to-rotate globe showing MAG_CAL_PROGRESS's 80-section coverage mask, mirroring the
 * coverage sphere Mission Planner shows during compass calibration - lets the user see which
 * orientations still need to be sampled by rotating the vehicle further, instead of only
 * knowing an overall percentage. No 3D library involved: an orthographic projection of
 * ArduPilot's own geodesic grid (see geodesicGrid.ts), same hand-rolled-SVG approach as
 * PrimaryFlightDisplay.
 */
export function CompassCoverageSphere({ completionMask, completionPct, size = DEFAULT_SIZE }: CompassCoverageSphereProps) {
  const [azimuthDeg, setAzimuthDeg] = useState(20);
  const [elevationDeg, setElevationDeg] = useState(-15);
  const dragRef = useRef<{ x: number; y: number; azimuthDeg: number; elevationDeg: number } | null>(null);

  const center = size / 2;
  const radius = size * RADIUS_RATIO;
  const sections = projectCoverageSphere(completionMask, azimuthDeg, elevationDeg, radius);

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, azimuthDeg, elevationDeg };
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    setAzimuthDeg(drag.azimuthDeg + dx * 0.5);
    setElevationDeg(Math.max(-89, Math.min(89, drag.elevationDeg - dy * 0.5)));
  }

  function handlePointerUp() {
    dragRef.current = null;
  }

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label={`${Math.round(completionPct)}%`}
      className="cursor-grab touch-none active:cursor-grabbing"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <circle cx={center} cy={center} r={radius + 1} fill="none" stroke="var(--border)" strokeWidth={1} />
      {sections.map(({ section, points, covered }) => (
        <polygon
          key={section}
          points={points.map(([x, y]) => `${x + center},${y + center}`).join(" ")}
          fill={covered ? "var(--primary)" : "var(--muted)"}
          fillOpacity={covered ? 0.85 : 0.35}
          stroke="var(--card)"
          strokeWidth={0.5}
        />
      ))}
    </svg>
  );
}
