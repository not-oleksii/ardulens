import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "./badge";

const meta: Meta<typeof Badge> = {
  title: "Components/Badge",
  component: Badge,
  parameters: { layout: "centered" },
  argTypes: {
    variant: { control: "select", options: ["good", "warning", "critical", "info", "neutral"] },
  },
};
export default meta;

type Story = StoryObj<typeof Badge>;

export const Default: Story = {
  args: { variant: "good", children: "Armed & healthy" },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="good">Armed &amp; healthy</Badge>
      <Badge variant="warning">Vibration elevated</Badge>
      <Badge variant="critical">EKF variance critical</Badge>
      <Badge variant="info">GPS: 11 sats, 3D fix</Badge>
      <Badge variant="neutral">Not connected</Badge>
    </div>
  ),
};

export const NoDot: Story = {
  args: { variant: "info", dot: false, children: "1,464 params" },
};
