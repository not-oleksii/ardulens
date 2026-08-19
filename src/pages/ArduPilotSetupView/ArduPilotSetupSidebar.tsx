import {
  BatteryMedium,
  ChevronsLeft,
  ChevronsRight,
  Cog,
  Compass,
  Gauge,
  Joystick,
  List,
  MonitorPlay,
  MoveDiagonal,
  Radio,
  SlidersHorizontal,
  Zap,
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
  | "parameters"
  | "compassCal"
  | "accelCal"
  | "rcCal"
  | "rcSetup"
  | "escCal"
  | "motorsSetup"
  | "batteryConfig"
  | "pidTune"
  | "osdSetup";

const SECTIONS: readonly ArduPilotSetupSection[] = [
  "telemetry",
  "parameters",
  "compassCal",
  "accelCal",
  "rcCal",
  "rcSetup",
  "escCal",
  "motorsSetup",
  "batteryConfig",
  "pidTune",
  "osdSetup",
];

const SECTION_ICONS = {
  telemetry: Gauge,
  parameters: List,
  compassCal: Compass,
  accelCal: MoveDiagonal,
  rcCal: Joystick,
  rcSetup: Radio,
  escCal: Zap,
  motorsSetup: Cog,
  batteryConfig: BatteryMedium,
  pidTune: SlidersHorizontal,
  osdSetup: MonitorPlay,
} as const satisfies Record<ArduPilotSetupSection, typeof Gauge>;

interface ArduPilotSetupSidebarProps {
  activeSection: ArduPilotSetupSection;
  onSelect: (section: ArduPilotSetupSection) => void;
}

export function ArduPilotSetupSidebar({ activeSection, onSelect }: ArduPilotSetupSidebarProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col gap-6 border-r border-border py-5 transition-[width]",
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
        className="flex-1"
      >
        <TabsList>
          {SECTIONS.map((section) => {
            const Icon = SECTION_ICONS[section];
            const label = t(`ardupilotSetup.sidebar.${section}`);
            return (
              <TabsTrigger
                key={section}
                value={section}
                aria-label={label}
                title={collapsed ? label : undefined}
                className={cn(
                  collapsed ? "justify-center px-0" : "h-auto items-start py-2 whitespace-normal",
                )}
              >
                {/* Ukrainian labels (e.g. "Калібрування акселерометра") run noticeably longer
                    than their English counterparts and would clip past the sidebar's fixed
                    w-56 with the default single-line/nowrap tab style - wraps onto a second
                    line instead, with the icon nudged down to align with the first line. */}
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                {!collapsed && <span className="min-w-0 break-words">{label}</span>}
              </TabsTrigger>
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
