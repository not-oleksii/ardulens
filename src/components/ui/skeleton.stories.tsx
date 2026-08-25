import type { Meta, StoryObj } from "@storybook/react-vite";
import { Skeleton } from "./skeleton";

const meta: Meta<typeof Skeleton> = {
  title: "Components/Skeleton",
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof Skeleton>;

export const TableRows: Story = {
  render: () => (
    <div className="flex max-w-lg flex-col gap-2">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  ),
};

export const CardShape: Story = {
  render: () => (
    <div className="flex max-w-xs flex-col gap-3 rounded-lg border border-border p-4">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
    </div>
  ),
};
