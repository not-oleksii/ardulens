import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

const meta: Meta<typeof Popover> = {
  title: "Components/Popover",
  parameters: { layout: "centered" },
};
export default meta;

type Story = StoryObj<typeof Popover>;

export const Default: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">Column filters</Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3">
        <p className="text-xs font-medium">Table columns</p>
        <p className="mt-1 text-xs text-muted-foreground">Add or remove columns shown below.</p>
      </PopoverContent>
    </Popover>
  ),
};
