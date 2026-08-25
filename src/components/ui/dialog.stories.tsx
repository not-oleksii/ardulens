import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

const meta: Meta<typeof Dialog> = {
  title: "Components/Dialog (modal)",
  parameters: { layout: "centered" },
};
export default meta;

type Story = StoryObj<typeof Dialog>;

export const SaveConfirmation: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Save all (3)</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm 3 changes</DialogTitle>
          <DialogDescription>These parameters will be written to the vehicle.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5 rounded-md border border-border p-3 font-mono text-xs">
          <div className="flex justify-between">
            <span>ATC_RAT_RLL_P</span>
            <span>0.135 → 0.150</span>
          </div>
          <div className="flex justify-between">
            <span>SERIAL1_BAUD</span>
            <span>57 → 115</span>
          </div>
          <div className="flex justify-between">
            <span>RTL_ALT</span>
            <span>1500 → 3000</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline">Cancel</Button>
          <Button>Confirm &amp; send</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};
