import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Drawer, DrawerContent, DrawerTrigger } from "./drawer";

const meta: Meta<typeof Drawer> = {
  title: "Components/Drawer",
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof Drawer>;

export const OverAMap: Story = {
  render: function Render() {
    const [open, setOpen] = useState(true);
    return (
      <div className="relative h-96 w-full overflow-hidden bg-[repeating-linear-gradient(45deg,var(--muted),var(--muted)_10px,var(--card)_10px,var(--card)_20px)]">
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent glass>
            <DrawerTrigger>
              <span>Waypoints (3)</span>
            </DrawerTrigger>
            <div className="min-h-0 flex-1 overflow-y-auto border-t border-border p-3 text-sm">
              <p>1. Waypoint — 50.4501, 30.5234, 50m</p>
              <p>2. Waypoint — 50.4512, 30.5250, 60m</p>
              <p>3. RTL</p>
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    );
  },
};
