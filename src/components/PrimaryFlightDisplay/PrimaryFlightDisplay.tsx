import { useId } from "react";
import { useTranslation } from "react-i18next";
import { buildHeadingTapeTicks, buildPitchLadderRungs, buildRollScaleTicks, buildTapeTicks, radToDeg } from "./pfdMath";
import { PFD_TEST_IDS } from "./pfdTestIds";
import type { PrimaryFlightDisplayProps } from "./types";

// Uses the app's own CSS custom properties (same ones Logs/Graphs/Map already render with)
// rather than a separate hardcoded palette, so the PFD follows the app's light/dark theme
// like everything else - browsers resolve var() inside SVG presentation attributes (fill/
// stroke) the same as in a real style property. Sky/ground are the one exception: they're
// representational (blue sky, brown ground), not a brand color, so they stay fixed.
const COLORS = {
  panel: "var(--muted)",
  border: "var(--border)",
  sky: "#2f6fb0",
  ground: "#8a5a2b",
  horizonLine: "var(--foreground)",
  tick: "var(--foreground)",
  telemetry: "var(--primary)",
  badgeBorder: "var(--primary)",
};

const FONT_SANS = "'Exo 2', sans-serif";
const FONT_MONO = "'PT Mono', monospace";

const ATT_CX = 200;
const ATT_CY = 150;
const ATT_R = 105;
const PX_PER_DEG_PITCH = 4;

const TAPE_TOP = 40;
const TAPE_BOTTOM = 260;
const TAPE_CY = (TAPE_TOP + TAPE_BOTTOM) / 2;
const TAPE_HALF_H = (TAPE_BOTTOM - TAPE_TOP) / 2;

const SPEED_HALF_SPAN = 15; // m/s shown either side of current value
const SPEED_STEP = 5;
const SPEED_PX_PER_UNIT = TAPE_HALF_H / SPEED_HALF_SPAN;

const ALT_HALF_SPAN = 30; // m shown either side of current value
const ALT_STEP = 10;
const ALT_PX_PER_UNIT = TAPE_HALF_H / ALT_HALF_SPAN;

const HEADING_HALF_SPAN = 40; // deg shown either side of current heading
const HEADING_STEP = 10;
const HEADING_WIDTH = 360;
const HEADING_PX_PER_DEG = (HEADING_WIDTH / 2) / HEADING_HALF_SPAN;

function formatSigned(v: number): string {
  return v > 0 ? `+${v}` : `${v}`;
}

/**
 * Vertical scrolling tape - used for both airspeed (left, ticks/readout facing right/inward)
 * and altitude (right, ticks/readout facing left/inward, mirrored via the `side` prop so the
 * readout box always points toward the attitude indicator rather than off the edge of the
 * panel).
 */
function VerticalTape({
  x,
  side,
  label,
  value,
  halfSpan,
  step,
  pxPerUnit,
  decimals,
}: {
  x: number;
  side: "left" | "right";
  label: string;
  value: number | null;
  halfSpan: number;
  step: number;
  pxPerUnit: number;
  decimals: number;
}) {
  const clipId = useId();
  const center = value ?? 0;
  const ticks = buildTapeTicks(center, halfSpan, step, pxPerUnit);
  const width = 60;
  const edgeX = side === "left" ? x + width : x; // the tape's inward-facing edge
  const dir = side === "left" ? 1 : -1;

  return (
    <g>
      <clipPath id={clipId}>
        <rect x={x} y={TAPE_TOP} width={width} height={TAPE_BOTTOM - TAPE_TOP} />
      </clipPath>
      <rect x={x} y={TAPE_TOP} width={width} height={TAPE_BOTTOM - TAPE_TOP} fill={COLORS.panel} stroke={COLORS.border} />
      <text x={x + width / 2} y={TAPE_TOP - 6} fill={COLORS.tick} fontSize={10} fontFamily={FONT_SANS} textAnchor="middle">
        {label}
      </text>
      <g clipPath={`url(#${clipId})`} opacity={value === null ? 0.35 : 1}>
        {ticks.map((t) => (
          <g key={t.value}>
            <line
              x1={edgeX - dir * 15}
              y1={TAPE_CY + t.offsetPx}
              x2={edgeX}
              y2={TAPE_CY + t.offsetPx}
              stroke={COLORS.tick}
              strokeWidth={1}
            />
            <text
              x={edgeX - dir * 20}
              y={TAPE_CY + t.offsetPx}
              fill={COLORS.tick}
              fontSize={11}
              fontFamily={FONT_MONO}
              textAnchor={dir > 0 ? "end" : "start"}
              dominantBaseline="middle"
            >
              {t.value}
            </text>
          </g>
        ))}
      </g>
      <polygon
        points={`${edgeX},${TAPE_CY} ${edgeX + dir * 8},${TAPE_CY - 9} ${edgeX + dir * 40},${TAPE_CY - 9} ${edgeX + dir * 40},${TAPE_CY + 9} ${edgeX + dir * 8},${TAPE_CY + 9}`}
        fill={COLORS.panel}
        stroke={COLORS.telemetry}
        strokeWidth={1.5}
      />
      <text
        x={edgeX + dir * 24}
        y={TAPE_CY}
        fill={COLORS.telemetry}
        fontSize={14}
        fontWeight="bold"
        fontFamily={FONT_MONO}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {value === null ? "--" : value.toFixed(decimals)}
      </text>
    </g>
  );
}

/** The circular attitude indicator (artificial horizon) with pitch ladder and roll scale. */
function AttitudeIndicator({ rollRad, pitchRad }: { rollRad: number | null; pitchRad: number | null }) {
  const clipId = useId();
  const hasAttitude = rollRad !== null && pitchRad !== null;
  const rollDeg = hasAttitude ? radToDeg(rollRad) : 0;
  const pitchDeg = hasAttitude ? radToDeg(pitchRad) : 0;
  const rungs = buildPitchLadderRungs(PX_PER_DEG_PITCH);
  const rollScaleTicks = buildRollScaleTicks(ATT_CX, ATT_CY, ATT_R + 20);

  // Real ADI convention: the horizon disk translates along the aircraft's pitch axis first
  // (pre-rotation), then the whole thing rotates by -roll around the center - the ground
  // disk rotates opposite to the physical bank direction, matching how the world appears to
  // tilt from the pilot's point of view.
  const pitchOffsetY = pitchDeg * PX_PER_DEG_PITCH;
  const horizonTransform = `rotate(${-rollDeg} ${ATT_CX} ${ATT_CY}) translate(0 ${pitchOffsetY})`;

  return (
    <g opacity={hasAttitude ? 1 : 0.35}>
      <clipPath id={clipId}>
        <circle cx={ATT_CX} cy={ATT_CY} r={ATT_R} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <g transform={horizonTransform}>
          <rect x={ATT_CX - 300} y={ATT_CY - 900} width={600} height={900} fill={COLORS.sky} />
          <rect x={ATT_CX - 300} y={ATT_CY} width={600} height={900} fill={COLORS.ground} />
          <line x1={ATT_CX - 300} y1={ATT_CY} x2={ATT_CX + 300} y2={ATT_CY} stroke={COLORS.horizonLine} strokeWidth={2} />
          {rungs.map((r) => (
            <g key={r.angleDeg}>
              <line
                x1={ATT_CX - r.halfWidthPx}
                y1={ATT_CY + r.localY}
                x2={ATT_CX + r.halfWidthPx}
                y2={ATT_CY + r.localY}
                stroke={COLORS.horizonLine}
                strokeWidth={1.5}
              />
              <text
                x={ATT_CX + r.halfWidthPx + 6}
                y={ATT_CY + r.localY}
                fill={COLORS.horizonLine}
                fontSize={10}
                fontFamily={FONT_MONO}
                dominantBaseline="middle"
              >
                {formatSigned(r.angleDeg)}
              </text>
            </g>
          ))}
        </g>
      </g>
      <circle cx={ATT_CX} cy={ATT_CY} r={ATT_R} fill="none" stroke={COLORS.border} strokeWidth={2} />

      {/* Fixed roll scale (doesn't rotate) with tick marks + a pointer that rotates with roll. */}
      {rollScaleTicks.map((t) => (
        <g key={t.angleDeg}>
          <circle cx={t.x} cy={t.y} r={t.angleDeg === 0 ? 0 : 1.5} fill={COLORS.tick} />
          <text x={t.x} y={t.y - 10} fill={COLORS.tick} fontSize={9} fontFamily={FONT_MONO} textAnchor="middle">
            {Math.abs(t.angleDeg)}
          </text>
        </g>
      ))}
      <polygon
        points={`${ATT_CX},${ATT_CY - ATT_R - 8} ${ATT_CX - 6},${ATT_CY - ATT_R - 20} ${ATT_CX + 6},${ATT_CY - ATT_R - 20}`}
        fill={COLORS.telemetry}
        transform={`rotate(${rollDeg} ${ATT_CX} ${ATT_CY})`}
      />

      {/* Fixed aircraft symbol (wings + center dot) - always level, marks the actual nose position. */}
      <line x1={ATT_CX - 40} y1={ATT_CY} x2={ATT_CX - 12} y2={ATT_CY} stroke={COLORS.telemetry} strokeWidth={3} />
      <line x1={ATT_CX + 12} y1={ATT_CY} x2={ATT_CX + 40} y2={ATT_CY} stroke={COLORS.telemetry} strokeWidth={3} />
      <polygon points={`${ATT_CX},${ATT_CY - 8} ${ATT_CX - 7},${ATT_CY + 4} ${ATT_CX + 7},${ATT_CY + 4}`} fill={COLORS.telemetry} />
    </g>
  );
}

/** Horizontal scrolling compass tape along the bottom of the panel. */
function HeadingTape({ headingDeg }: { headingDeg: number | null }) {
  const clipId = useId();
  const width = HEADING_WIDTH;
  const cx = width / 2;
  const center = headingDeg ?? 0;
  const ticks = buildHeadingTapeTicks(center, HEADING_HALF_SPAN, HEADING_STEP, HEADING_PX_PER_DEG);

  return (
    <svg viewBox={`0 0 ${width} 50`} className="w-full" role="img" aria-hidden="true">
      <clipPath id={clipId}>
        <rect x={0} y={0} width={width} height={36} />
      </clipPath>
      <rect x={0} y={0} width={width} height={36} fill={COLORS.panel} stroke={COLORS.border} />
      <g clipPath={`url(#${clipId})`} opacity={headingDeg === null ? 0.35 : 1}>
        {ticks.map((t, i) => (
          <g key={`${t.value}-${i}`}>
            <line x1={cx + t.offsetPx} y1={20} x2={cx + t.offsetPx} y2={30} stroke={COLORS.tick} strokeWidth={1} />
            <text x={cx + t.offsetPx} y={14} fill={COLORS.tick} fontSize={10} fontFamily={FONT_MONO} textAnchor="middle">
              {t.value}
            </text>
          </g>
        ))}
      </g>
      <polygon points={`${cx},4 ${cx - 6},-4 ${cx + 6},-4`} fill={COLORS.telemetry} transform="translate(0 8)" />
      <rect x={cx - 24} y={36} width={48} height={14} fill={COLORS.panel} stroke={COLORS.telemetry} strokeWidth={1.5} />
      <text
        x={cx}
        y={43}
        fill={COLORS.telemetry}
        fontSize={11}
        fontWeight="bold"
        fontFamily={FONT_MONO}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {headingDeg === null ? "--" : Math.round(headingDeg)}
      </text>
    </svg>
  );
}

export function PrimaryFlightDisplay({
  rollRad,
  pitchRad,
  headingDeg,
  airspeed,
  altitudeM,
  armed,
  modeLabel,
  warningOverlay,
}: PrimaryFlightDisplayProps) {
  const { t } = useTranslation();

  return (
    <div
      className="flex flex-col gap-1 rounded-lg p-3"
      style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, fontFamily: FONT_SANS }}
    >
      <div className="mb-1 flex items-center justify-center gap-2">
        <span
          data-testid={PFD_TEST_IDS.armedBadge}
          className="rounded border px-2 py-0.5 text-xs font-bold tracking-wide"
          style={{ borderColor: COLORS.badgeBorder, color: COLORS.telemetry }}
        >
          {armed ? t("ardupilotSetup.vehicle.armed") : t("ardupilotSetup.vehicle.disarmed")}
        </span>
        <span
          data-testid={PFD_TEST_IDS.modeBadge}
          className="rounded border px-2 py-0.5 text-xs font-bold tracking-wide"
          style={{ borderColor: COLORS.badgeBorder, color: COLORS.telemetry }}
        >
          {modeLabel}
        </span>
      </div>
      {/* relative: anchors warningOverlay precisely against this SVG's own known 400x300
          coordinate space (the attitude circle spans x=95-305, y=45-255, i.e. 15-85% either
          way) - not against the whole panel, whose total height also depends on the badges
          row and heading tape below, which aren't a fixed proportion of the panel's width. */}
      <div className="relative">
        <svg viewBox="0 0 400 300" className="w-full" role="img" aria-label={t("ardupilotSetup.telemetry.pfdAriaLabel")}>
          <VerticalTape
            x={0}
            side="left"
            label={t("ardupilotSetup.telemetry.pfd.airspeedLabel")}
            value={airspeed}
            halfSpan={SPEED_HALF_SPAN}
            step={SPEED_STEP}
            pxPerUnit={SPEED_PX_PER_UNIT}
            decimals={1}
          />
          <AttitudeIndicator rollRad={rollRad} pitchRad={pitchRad} />
          <VerticalTape
            x={340}
            side="right"
            label={t("ardupilotSetup.telemetry.pfd.altitudeLabel")}
            value={altitudeM}
            halfSpan={ALT_HALF_SPAN}
            step={ALT_STEP}
            pxPerUnit={ALT_PX_PER_UNIT}
            decimals={0}
          />
        </svg>
        {warningOverlay && (
          // Lower portion of the horizon circle only (58%-96% vertically, 15%-85%
          // horizontally) - real HUD/OSD convention for warning text, and guarantees this
          // never spills past the SVG's own bottom edge into whatever comes after the PFD.
          <div className="absolute inset-x-[15%] top-[58%] bottom-[4%] z-10 flex flex-col justify-end overflow-y-auto">
            {warningOverlay}
          </div>
        )}
      </div>
      <HeadingTape headingDeg={headingDeg} />
    </div>
  );
}
