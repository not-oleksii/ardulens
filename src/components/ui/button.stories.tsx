import type { Meta, StoryObj } from "@storybook/react-vite";
import { Download } from "lucide-react";
import { Button } from "./button";

const meta: Meta<typeof Button> = {
  title: "Components/Button",
  component: Button,
  parameters: { layout: "centered" },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "destructive", "outline", "secondary", "ghost", "link"],
    },
    size: { control: "select", options: ["default", "sm", "lg", "icon"] },
  },
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Default: Story = {
  args: { children: "Connect", variant: "default" },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Button variant="default">Connect</Button>
      <Button variant="secondary">Save all (3)</Button>
      <Button variant="outline">Refresh ports</Button>
      <Button variant="destructive">Disarm</Button>
      <Button variant="ghost">Cancel</Button>
      <Button variant="link">View details</Button>
    </div>
  ),
};

export const WithIcon: Story = {
  render: () => (
    <Button>
      <Download className="size-4" />
      Save .tlog
    </Button>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
      <Button size="icon" aria-label="Download">
        <Download className="size-4" />
      </Button>
    </div>
  ),
};
