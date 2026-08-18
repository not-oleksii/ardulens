import {
  ChevronsLeft,
  ChevronsRight,
  FileText,
  GitCompare,
  LineChart,
  Map,
  Settings2,
  Stethoscope,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher/ThemeSwitcher";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useFileStore } from "../../stores/fileStore/fileStore";
import { VISIBLE_TABS, useUiStore, type Tab } from "../../stores/uiStore/uiStore";

const TAB_ICONS = {
  logs: FileText,
  graphs: LineChart,
  map: Map,
  parameters: Settings2,
  advisor: Stethoscope,
  compare: GitCompare,
} as const satisfies Record<Tab, typeof FileText>;

export function Sidebar() {
  const { t } = useTranslation();
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const clearFile = useFileStore((s) => s.clearFile);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col gap-6 border-r border-border py-5 transition-[width]",
        collapsed ? "w-16 px-2" : "w-56 px-4",
      )}
    >
      <div className={cn("flex items-center gap-2", collapsed ? "justify-center" : "justify-between px-2")}>
        {!collapsed && <h1 className="m-0 text-2xl tracking-tight">ArduLens</h1>}
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
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as Tab)}
        orientation="vertical"
        className="flex-1"
      >
        <TabsList>
          {VISIBLE_TABS.map((tab) => {
            const Icon = TAB_ICONS[tab];
            return (
              <TabsTrigger
                key={tab}
                value={tab}
                aria-label={t(`tabs.${tab}`)}
                title={collapsed ? t(`tabs.${tab}`) : undefined}
                className={cn(collapsed && "justify-center px-0")}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{t(`tabs.${tab}`)}</span>}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
      <Button
        variant="ghost"
        aria-label={t("sidebar.changeFile")}
        title={collapsed ? t("sidebar.changeFile") : undefined}
        className={cn("gap-2", collapsed ? "justify-center px-0" : "justify-start")}
        onClick={clearFile}
      >
        <Upload className="h-4 w-4 shrink-0" />
        {!collapsed && <span>{t("sidebar.changeFile")}</span>}
      </Button>
      <div className={cn("flex flex-wrap gap-2", collapsed && "flex-col")}>
        <ThemeSwitcher compact={collapsed} />
        <LanguageSwitcher compact={collapsed} />
      </div>
    </aside>
  );
}
