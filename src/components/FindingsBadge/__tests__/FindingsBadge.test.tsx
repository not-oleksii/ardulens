import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Finding } from "../../../analysis/advisors/types";
import { FindingsBadge } from "../FindingsBadge";

describe("FindingsBadge", () => {
  it("shows a quiet 'no issues' indicator when there are no findings", () => {
    render(<FindingsBadge findings={[]} />);

    expect(screen.getByText("Проблем не знайдено")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a count badge and reveals full details on click", async () => {
    const user = userEvent.setup();
    const findings: Finding[] = [
      { id: "voltage-sag-warning", severity: "warning", messageKey: "findings.voltageSagWarning", params: { drop: "10", takeoff: "25.00", sag: "22.50" } },
      { id: "gps-integrity-warning", severity: "warning", messageKey: "findings.gpsIntegrityWarning", params: { removed: 6 } },
    ];
    render(<FindingsBadge findings={findings} />);

    const trigger = screen.getByRole("button", { name: "Знайдено зауважень: 2 - натисніть для деталей" });
    expect(trigger).toHaveTextContent("2");
    expect(screen.queryByText(/Помітна просадка напруги/)).not.toBeInTheDocument();

    await user.click(trigger);

    expect(await screen.findByText(/Помітна просадка напруги під газом: 10%/)).toBeInTheDocument();
    expect(screen.getByText(/Відкинуто 6 точок треку як телепорт\/спуфінг/)).toBeInTheDocument();
  });

  it("colors the badge by the worst severity present, even when milder findings also exist", async () => {
    const user = userEvent.setup();
    const findings: Finding[] = [
      { id: "a", severity: "info", messageKey: "findings.gpsIntegrityWarning", params: { removed: 1 } },
      { id: "b", severity: "critical", messageKey: "findings.gpsIntegrityCritical", params: { removed: 50, fraction: "20" } },
    ];
    render(<FindingsBadge findings={findings} />);

    const trigger = screen.getByRole("button", { name: "Знайдено зауважень: 2 - натисніть для деталей" });
    expect(trigger.className).toMatch(/destructive/);

    await user.click(trigger);
    expect(await screen.findByText(/Відкинуто 50 точок треку \(20%\)/)).toBeInTheDocument();
  });
});
