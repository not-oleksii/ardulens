import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Checkbox } from "./checkbox";

const meta: Meta<typeof Checkbox> = {
  title: "Components/Checkbox",
  component: Checkbox,
  parameters: { layout: "centered" },
};
export default meta;

type Story = StoryObj<typeof Checkbox>;

export const Default: Story = {
  render: function Render() {
    const [checked, setChecked] = useState(true);
    return (
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} />
        Show GCS track
      </label>
    );
  },
};

export const Disabled: Story = {
  render: () => (
    <div className="flex flex-col gap-2 text-sm">
      <label className="flex items-center gap-2 opacity-50">
        <Checkbox disabled checked />
        Show cleaned track (disabled, checked)
      </label>
      <label className="flex items-center gap-2 opacity-50">
        <Checkbox disabled />
        Show cleaned track (disabled, unchecked)
      </label>
    </div>
  ),
};
