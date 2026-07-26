import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { COLUMNS } from "../../../analysis/metrics/metrics";
import { DashboardView } from "../DashboardView";

describe("DashboardView", () => {
  it("renders the column count from the metrics module", () => {
    render(<DashboardView />);
    expect(screen.getByText(`Колонки: ${COLUMNS.length}`)).toBeInTheDocument();
  });
});
