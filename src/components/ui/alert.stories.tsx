import type { Meta, StoryObj } from "@storybook/react-vite";
import { Alert, AlertDescription, AlertTitle } from "./alert";

const meta: Meta<typeof Alert> = {
  title: "Components/Alert",
  component: Alert,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof Alert>;

export const AllVariants: Story = {
  render: () => (
    <div className="flex max-w-lg flex-col gap-3">
      <Alert variant="info">
        <AlertDescription>.bin: takeoff/landing time is manual — GPS time can be spoofed.</AlertDescription>
      </Alert>
      <Alert variant="good">
        <AlertDescription>Parameters written — 3 of 3 confirmed by the vehicle.</AlertDescription>
      </Alert>
      <Alert variant="warning">
        <AlertDescription>Voltage sag of 11% detected under load.</AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <AlertDescription>Connection lost — no heartbeat for 6 seconds.</AlertDescription>
      </Alert>
      <Alert variant="default">
        <AlertDescription>A plain neutral banner — no auto-icon, this isn't a severity signal.</AlertDescription>
      </Alert>
    </div>
  ),
};

export const WithTitle: Story = {
  render: () => (
    <Alert variant="warning" className="max-w-lg">
      <AlertTitle>Reboot required</AlertTitle>
      <AlertDescription>Some changed parameters only take effect after the vehicle reboots.</AlertDescription>
    </Alert>
  ),
};

export const Destructive: Story = {
  args: {
    variant: "destructive",
    children: <AlertDescription>Connection lost — no heartbeat for 6 seconds.</AlertDescription>,
  },
};
