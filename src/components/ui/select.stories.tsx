import type { Meta, StoryObj } from "@storybook/react-vite";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

const meta: Meta<typeof Select> = {
  title: "Components/Select (dropdown)",
  parameters: { layout: "centered" },
};
export default meta;

type Story = StoryObj<typeof Select>;

export const Default: Story = {
  render: () => (
    <Select defaultValue="mavlink2">
      <SelectTrigger className="w-48">
        <SelectValue placeholder="Protocol" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="mavlink1">MAVLink 1</SelectItem>
        <SelectItem value="mavlink2">MAVLink 2</SelectItem>
        <SelectItem value="gps">GPS</SelectItem>
        <SelectItem value="frsky">FrSky Telemetry</SelectItem>
      </SelectContent>
    </Select>
  ),
};
