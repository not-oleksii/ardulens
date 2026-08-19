import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { localOffsetMeters, niceRadiusMeters, type LocalOffsetM } from "../../mavlink/localPosition/localPosition";
import type { PositionTelemetry } from "../../stores/mavlinkTelemetryStore/types";

interface TokenlessPositionRadarProps {
  position: PositionTelemetry | null;
  headingDeg: number | undefined;
}

// A north-up range-ring display, in plain SVG - no map tiles, no external service, nothing to
// sign up for. Shown while no Cesium ion token is set (see LiveMapSection.tsx), so a user still
// sees *something* live (where the vehicle is relative to where it started, and roughly how
// far) instead of the map being fully blocked behind a third-party account.
const VIEW_SIZE = 260;
const CENTER = VIEW_SIZE / 2;
const RING_RADIUS_PX = 105;
// Caps how many trail points are kept - a long flight shouldn't grow this SVG's path data
// unboundedly; this is a live "where is it now" indicator, not a full-flight recording (that's
// what the real Cesium map + flight-log Graphs page are for).
const MAX_TRAIL_POINTS = 500;

export function TokenlessPositionRadar({ position, headingDeg }: TokenlessPositionRadarProps) {
  const { t } = useTranslation();
  // Only ever read/written inside the effect below, never during render - the trail itself
  // (what rendering actually needs) is real state, updated once per position change.
  const originRef = useRef<{ lat: number; lon: number } | null>(null);
  const [trail, setTrail] = useState<LocalOffsetM[]>([]);

  useEffect(() => {
    if (!position) return;
    if (!originRef.current) originRef.current = { lat: position.lat, lon: position.lon };
    const offset = localOffsetMeters(position.lat, position.lon, originRef.current.lat, originRef.current.lon);
    setTrail((prev) => [...prev, offset].slice(-MAX_TRAIL_POINTS));
  }, [position]);

  if (!position || trail.length === 0) {
    return <p className="text-xs text-muted-foreground">{t("ardupilotSetup.map.noFix")}</p>;
  }

  const current = trail[trail.length - 1]!;
  const farthestM = Math.max(10, ...trail.map((p) => Math.hypot(p.east, p.north)));
  const radiusM = niceRadiusMeters(farthestM);
  const scale = RING_RADIUS_PX / radiusM;
  const toScreen = (p: LocalOffsetM) => ({ x: CENTER + p.east * scale, y: CENTER - p.north * scale });
  const trailPoints = trail.map((p) => toScreen(p));
  const pathD = trailPoints.length > 1 ? `M ${trailPoints.map((p) => `${p.x},${p.y}`).join(" L ")}` : "";
  const currentScreen = toScreen(current);
  const distanceFromHomeM = Math.hypot(current.east, current.north);
  const rotation = headingDeg ?? 0;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
        className="h-full max-h-[420px] w-full max-w-[420px]"
        role="img"
        aria-label={t("ardupilotSetup.map.radarLabel")}
        data-testid="tokenless-position-radar"
      >
        <circle cx={CENTER} cy={CENTER} r={RING_RADIUS_PX} fill="none" stroke="currentColor" className="text-border" strokeWidth={1} />
        <circle cx={CENTER} cy={CENTER} r={RING_RADIUS_PX / 2} fill="none" stroke="currentColor" className="text-border" strokeWidth={1} />
        <text x={CENTER + 4} y={CENTER - RING_RADIUS_PX / 2 - 4} className="fill-muted-foreground text-[9px]">
          {radiusM / 2} m
        </text>
        <text x={CENTER + 4} y={CENTER - RING_RADIUS_PX - 4} className="fill-muted-foreground text-[9px]">
          {radiusM} m
        </text>
        <text x={CENTER} y={16} textAnchor="middle" className="fill-muted-foreground text-[10px] font-bold">
          N
        </text>
        {/* Home marker - the origin every offset above is measured from (the first fix seen this
            session), not necessarily the vehicle's own configured home position. */}
        <circle cx={CENTER} cy={CENTER} r={3} fill="none" stroke="currentColor" className="text-muted-foreground" strokeWidth={1.5} />
        {pathD && <path d={pathD} fill="none" stroke="currentColor" className="text-primary/50" strokeWidth={1.5} />}
        <polygon
          points="0,-8 6,7 0,3 -6,7"
          fill="currentColor"
          className="text-primary"
          transform={`translate(${currentScreen.x}, ${currentScreen.y}) rotate(${rotation})`}
        />
      </svg>
      <p className="font-mono text-xs text-muted-foreground">
        {t("ardupilotSetup.map.distanceFromStart", { meters: Math.round(distanceFromHomeM) })}
      </p>
    </div>
  );
}
