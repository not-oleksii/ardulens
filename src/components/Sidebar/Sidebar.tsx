import {
  Camera,
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
import { SettingsDialog } from "@/components/SettingsDialog/SettingsDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useFileStore } from "../../stores/fileStore/fileStore";
import { useUnsavedChangesStore } from "../../stores/unsavedChangesStore/unsavedChangesStore";
import { VISIBLE_TABS, useUiStore, type Tab } from "../../stores/uiStore/uiStore";

const TAB_ICONS = {
  logs: FileText,
  graphs: LineChart,
  map: Map,
  geotag: Camera,
  parameters: Settings2,
  advisor: Stethoscope,
  compare: GitCompare,
} as const satisfies Record<Tab, typeof FileText>;

export function Sidebar() {
  const { t } = useTranslation();
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const file = useFileStore((s) => s.file);
  const clearFile = useFileStore((s) => s.clearFile);
  const [collapsed, setCollapsed] = useState(false);
  // GeoTagView sets useUnsavedChangesStore's hasUnsaved while it has a picked photo folder
  // (real work worth protecting) - both actions below would otherwise silently discard it with
  // no warning: "Change file" replaces the shared file outright, and switching tabs unmounts
  // GeoTagView just as completely (App.tsx's LogViewerRoot renders only ONE tab component at a
  // time - VIEWS[activeTab] - so a tab switch is just as destructive as changing the file, even
  // though it doesn't touch the file itself).
  const [pendingDiscard, setPendingDiscard] = useState<{ tab: Tab } | { changeFile: true } | null>(null);

  function handleChangeFileClick() {
    if (useUnsavedChangesStore.getState().hasUnsaved) setPendingDiscard({ changeFile: true });
    else clearFile();
  }

  function handleTabChange(value: string) {
    const tab = value as Tab;
    if (tab === activeTab) return;
    if (useUnsavedChangesStore.getState().hasUnsaved) setPendingDiscard({ tab });
    else setActiveTab(tab);
  }

  function confirmDiscard() {
    if (!pendingDiscard) return;
    if ("changeFile" in pendingDiscard) clearFile();
    else setActiveTab(pendingDiscard.tab);
    setPendingDiscard(null);
  }

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
      <Tabs value={activeTab} onValueChange={handleTabChange} orientation="vertical" className="flex-1">
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
      {!collapsed && file && (
        <p className="truncate px-2 text-xs text-muted-foreground" title={file.name}>
          {t("sidebar.currentFile", { name: file.name })}
        </p>
      )}
      <Button
        variant="ghost"
        aria-label={t("sidebar.changeFile")}
        title={collapsed ? t("sidebar.changeFile") : undefined}
        className={cn("gap-2", collapsed ? "justify-center px-0" : "justify-start")}
        onClick={handleChangeFileClick}
      >
        <Upload className="h-4 w-4 shrink-0" />
        {!collapsed && <span>{t("sidebar.changeFile")}</span>}
      </Button>

      <Dialog open={pendingDiscard !== null} onOpenChange={(open) => !open && setPendingDiscard(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("sidebar.confirmDiscardTitle")}</DialogTitle>
            <DialogDescription>{t("sidebar.confirmDiscardDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingDiscard(null)}>
              {t("sidebar.confirmDiscardStay")}
            </Button>
            <Button type="button" variant="destructive" onClick={confirmDiscard}>
              {t("sidebar.confirmDiscardChange")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SettingsDialog collapsed={collapsed} />
    </aside>
  );
}
