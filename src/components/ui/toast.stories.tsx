import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import { Toaster } from "./toaster";
import { toast } from "@/stores/toastStore/toastStore";

const meta: Meta = {
  title: "Components/Toast",
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
      <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 8 }}>
        Click a button - toasts stack in the bottom-right corner and auto-dismiss after 4s (or
        click the × / hover to pause the timer).
      </p>
      <Button
        onClick={() =>
          toast({ variant: "good", title: "Parameters written", description: "3 of 3 confirmed by the vehicle." })
        }
      >
        Fire a "good" toast
      </Button>
      <Button
        variant="outline"
        onClick={() => toast({ variant: "warning", description: "EKF variance elevated on the yaw axis." })}
      >
        Fire a "warning" toast
      </Button>
      <Button
        variant="destructive"
        onClick={() =>
          toast({ variant: "critical", title: "Command rejected", description: "REBOOT_SHUTDOWN was denied." })
        }
      >
        Fire a "critical" toast
      </Button>
      <Button variant="secondary" onClick={() => toast({ variant: "info", description: "Copied to clipboard." })}>
        Fire an "info" toast
      </Button>
      <Toaster />
    </div>
  ),
};
