import {
  BatteryMedium,
  ChevronsLeft,
  ChevronsRight,
  Cog,
  Compass,
  Gauge,
  Joystick,
  List,
  MoveDiagonal,
  Radio,
  SlidersHorizontal,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher/LanguageSwitcher";
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
  | "pidTune";

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
                className={cn(collapsed && "justify-center px-0")}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {/* TODO: Ukrainian labels (e.g. "Налаштування моторів", "Калібрування
                    акселерометра") run noticeably longer than their English counterparts and
                    overflow/clip past the sidebar's fixed w-56 in a narrow window - either
                    let the sidebar width grow to fit the active locale's longest label, or
                    wrap/shrink the label text instead of clipping it. */}
                {!collapsed && <span>{label}</span>}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
      <LanguageSwitcher compact={collapsed} />
    </aside>
  );
}
