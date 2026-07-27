import { useTranslation } from "react-i18next";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TABS, useUiStore, type Tab } from "../../stores/uiStore/uiStore";

export function TabBar() {
  const { t } = useTranslation();
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);

  return (
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as Tab)}>
      <TabsList>
        {TABS.map((tab) => (
          <TabsTrigger key={tab} value={tab}>
            {t(`tabs.${tab}`)}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
