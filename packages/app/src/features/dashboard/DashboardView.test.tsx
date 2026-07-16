import { render, screen } from "@testing-library/react";
import { COLUMNS } from "@ardulens/core";
import { describe, expect, it } from "vitest";
import { DashboardView } from "./DashboardView";

describe("DashboardView", () => {
  it("renders the column count from @ardulens/core, proving the workspace link resolves", () => {
    render(<DashboardView />);
    expect(screen.getByText(`Колонки з @ardulens/core: ${COLUMNS.length}`)).toBeInTheDocument();
  });
});
