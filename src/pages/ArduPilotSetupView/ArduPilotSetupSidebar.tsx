import {
  Activity,
  BatteryMedium,
  Cable,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Cog,
  Compass,
  Flag,
  Gauge,
  HardDrive,
  Joystick,
  List,
  ListTree,
  Map,
  MonitorPlay,
  MoveDiagonal,
  Radar,
  Radio,
  Settings2,
  Shield,
  SlidersHorizontal,
  ToggleRight,
  Video,
  Waves,
  Waypoints,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher/ThemeSwitcher";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type ArduPilotSetupSection =
  | "telemetry"
  | "missionPlan"
  | "fence"
  | "rally"
  | "mavlinkInspector"
  | "parameters"
  | "parameterTree"
  | "serialPorts"
  | "dataflashLogs"
  | "servoRelay"
  | "compassCal"
  | "accelCal"
  | "rcCal"
  | "rcSetup"
  | "escCal"
  | "motorsSetup"
  | "batteryConfig"
  | "pidTune"
  | "liveTuning"
  | "osdSetup"
  | "vtxSetup";

const SECTION_ICONS = {
  telemetry: Gauge,
  missionPlan: Waypoints,
  fence: Shield,
  rally: Flag,
  mavlinkInspector: Radar,
  parameters: List,
  parameterTree: ListTree,
  serialPorts: Cable,
  dataflashLogs: HardDrive,
  servoRelay: ToggleRight,
  compassCal: Compass,
  accelCal: MoveDiagonal,
  rcCal: Joystick,
  rcSetup: Radio,
  escCal: Zap,
  motorsSetup: Cog,
  batteryConfig: BatteryMedium,
  pidTune: SlidersHorizontal,
  liveTuning: Waves,
  osdSetup: MonitorPlay,
  vtxSetup: Video,
} as const satisfies Record<ArduPilotSetupSection, LucideIcon>;

interface CategoryDef {
  key: string;
  icon: LucideIcon;
  sections: readonly ArduPilotSetupSection[];
}

// "telemetry" stays outside every category, ungrouped, always visible at the top - it's the
// default landing section, not something to hunt for behind a disclosure toggle. Everything
// else is grouped by real-world task (matches Mission Planner's own PLAN/SETUP/CONFIG menu
// split, which this whole epic has been tracking for parity) so the sidebar shows ~5 top-level
// rows by default instead of 18 flat icons.
const CATEGORIES: readonly CategoryDef[] = [
  { key: "planning", icon: Map, sections: ["missionPlan", "fence", "rally"] },
  { key: "diagnostics", icon: Activity, sections: ["mavlinkInspector", "parameters", "parameterTree", "dataflashLogs", "serialPorts", "servoRelay"] },
  { key: "calibration", icon: Wrench, sections: ["compassCal", "accelCal", "rcCal", "escCal"] },
  { key: "setup", icon: Settings2, sections: ["rcSetup", "motorsSetup", "batteryConfig", "pidTune", "liveTuning", "osdSetup", "vtxSetup"] },
];

function categoryKeyFor(section: ArduPilotSetupSection): string | null {
  return CATEGORIES.find((c) => c.sections.includes(section))?.key ?? null;
}

interface ArduPilotSetupSidebarProps {
  activeSection: ArduPilotSetupSection;
  onSelect: (section: ArduPilotSetupSection) => void;
}

export function ArduPilotSetupSidebar({ activeSection, onSelect }: ArduPilotSetupSidebarProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  // Every category starts closed - the active section on first mount is always "telemetry"
  // (ungrouped), so this is also the state that shows the fewest icons on first load, which is
  // the whole point of grouping. Widened automatically (see the render-time adjustment below)
  // whenever `activeSection` lands on a section this sidebar didn't itself just reveal - e.g.
  // the Telemetry page's onboarding checklist jumps straight to "compassCal" via its own
  // onNavigateToSection callback, bypassing this sidebar entirely.
  const [openCategories, setOpenCategories] = useState<Set<string>>(() => {
    const key = categoryKeyFor(activeSection);
    return key ? new Set([key]) : new Set();
  });
  // Adjusted directly during render (React's own recommended pattern for "state that must
  // react to a prop change," see https://react.dev/learn/you-might-not-need-an-effect) rather
  // than in a useEffect - avoids an extra render pass, and the lint rule this codebase enforces
  // (react-hooks/set-state-in-effect) flags the effect-based version outright.
  const [lastActiveSection, setLastActiveSection] = useState(activeSection);
  if (activeSection !== lastActiveSection) {
    setLastActiveSection(activeSection);
    const key = categoryKeyFor(activeSection);
    if (key && !openCategories.has(key)) setOpenCategories(new Set(openCategories).add(key));
  }

  function toggleCategory(key: string) {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function renderLeaf(section: ArduPilotSetupSection) {
    const Icon = SECTION_ICONS[section];
    const label = t(`ardupilotSetup.sidebar.${section}`);
    return (
      <TabsTrigger
        key={section}
        value={section}
        aria-label={label}
        title={collapsed ? label : undefined}
        className={cn(collapsed ? "justify-center px-0" : "h-auto items-start py-2 whitespace-normal")}
      >
        {/* Ukrainian labels (e.g. "Калібрування акселерометра") run noticeably longer than
            their English counterparts and would clip past the sidebar's fixed w-56 with the
            default single-line/nowrap tab style - wraps onto a second line instead, with the
            icon nudged down to align with the first line. */}
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        {!collapsed && <span className="min-w-0 break-words">{label}</span>}
      </TabsTrigger>
    );
  }

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col gap-3 border-r border-border py-5 transition-[width]",
        collapsed ? "w-16 px-2" : "w-56 px-4",
      )}
    >
      <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-end px-2")}>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t(collapsed ? "sidebar.expand" : "sidebar.collapse")}
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </Button>
      </div>
      <Tabs
        value={activeSection}
        onValueChange={(value) => onSelect(value as ArduPilotSetupSection)}
        orientation="vertical"
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <TabsList className="gap-1.5">
          {renderLeaf("telemetry")}

          {CATEGORIES.map((cat) => {
            const isOpen = openCategories.has(cat.key);
            const CatIcon = cat.icon;
            const label = t(`ardupilotSetup.sidebar.category.${cat.key}`);
            return (
              <div key={cat.key} className="flex flex-col">
                <button
                  type="button"
                  onClick={() => toggleCategory(cat.key)}
                  aria-expanded={isOpen}
                  title={collapsed ? label : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-1.5 text-left text-xs font-bold tracking-wide text-muted-foreground uppercase transition-colors hover:bg-accent hover:text-foreground",
                    collapsed && "justify-center px-0",
                  )}
                >
                  <CatIcon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
                  {!collapsed &&
                    (isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />)}
                </button>
                {/* A CSS max-height transition, not the Collapsible component the Parameters
                    panel uses elsewhere - Radix's CollapsibleContent sets the native `hidden`
                    attribute while closed, which makes every tab inside inaccessible to both
                    real screen readers AND (the actual reason it's avoided here) testing-
                    library's getByRole - every existing test in this app clicks a sidebar tab
                    directly by name, with no "open its category first" step, and updating all
                    of them was unnecessary extra risk for a UI reshuffle. This keeps every tab
                    always mounted and always queryable/clickable regardless of a category's
                    open state - the same reasoning MissionPlanSection's own waypoints drawer
                    already established for its slide animation.
                    Not a `grid-template-rows` 0fr/1fr transition (tried first): confirmed two
                    separate real problems, not one. (1) This project's Tailwind v4 build
                    doesn't generate a real `.grid-rows-\[1fr\]{grid-template-rows:1fr}` rule for
                    the arbitrary-value utility at all (verified directly against the compiled
                    stylesheet, not assumed) - the same class of gap already hit for the Mission
                    Plan drawer's `translate-y-[calc(...)]`, fixed the same way (inline style).
                    (2) Even switched to a plain inline style, the transition itself never
                    animated - animating `grid-template-rows` needs browser support for CSS Grid
                    track-size interpolation, a genuinely recent addition (Chrome ~129/2024) that
                    can't be assumed present in every user's actual WebView2 install. `max-height`
                    is a universally-supported property that's been animatable since CSS
                    Transitions existed - no browser-support risk, unlike (2). A capped max-height
                    (28rem) rather than measuring real content height - every category's item
                    count is small and known ahead of time, so a generous fixed cap never clips
                    real content but avoids a ResizeObserver/JS-measurement round-trip. */}
                <div
                  className="overflow-hidden"
                  style={{ maxHeight: isOpen ? "28rem" : "0", transition: "max-height 300ms ease-in-out" }}
                >
                  <div className={cn("flex flex-col gap-1 pt-1", !collapsed && "ml-2 border-l border-border pl-2")}>
                    {cat.sections.map((section) => renderLeaf(section))}
                  </div>
                </div>
              </div>
            );
          })}
        </TabsList>
      </Tabs>
      <div className={cn("flex flex-wrap gap-2", collapsed && "flex-col")}>
        <ThemeSwitcher compact={collapsed} />
        <LanguageSwitcher compact={collapsed} />
      </div>
    </aside>
  );
}
