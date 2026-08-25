import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card";

const meta: Meta<typeof Card> = {
  title: "Components/Card",
  component: Card,
  parameters: { layout: "centered" },
};
export default meta;

type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Flight log</CardTitle>
        <CardDescription>3570.bin — 25.2V → 22.4V, 11% sag</CardDescription>
      </CardHeader>
      <CardContent>Loaded 1 flight, 3 findings.</CardContent>
    </Card>
  ),
};

export const Glass: Story = {
  name: "Glass (opt-in, over a busy background)",
  render: () => (
    <div className="relative h-56 w-96 overflow-hidden rounded-lg bg-[linear-gradient(135deg,var(--primary),var(--ardulens-status-info))] p-6">
      <Card glass className="w-72">
        <CardHeader>
          <CardTitle>Elevated panel</CardTitle>
          <CardDescription>glass=true — for a card that floats over other content</CardDescription>
        </CardHeader>
        <CardContent>The gradient behind it shows through the blur.</CardContent>
      </Card>
    </div>
  ),
};
