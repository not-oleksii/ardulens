import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrimaryFlightDisplay } from "../PrimaryFlightDisplay";
import type { PrimaryFlightDisplayProps } from "../types";

const BASE_PROPS: PrimaryFlightDisplayProps = {
  rollRad: 0.1745329, // ~10 deg
  pitchRad: -0.0872665, // ~-5 deg
  headingDeg: 267,
  airspeed: 12.3,
  altitudeM: 123.4,
  armed: true,
  modeLabel: "FBWA",
};

describe("PrimaryFlightDisplay", () => {
  it("renders the armed badge as armed and the mode label", () => {
    render(<PrimaryFlightDisplay {...BASE_PROPS} />);
    expect(screen.getByTestId("pfd-armed-badge")).toHaveTextContent("Озброєно");
    expect(screen.getByTestId("pfd-mode-badge")).toHaveTextContent("FBWA");
  });

  it("renders the disarmed badge when armed is false", () => {
    render(<PrimaryFlightDisplay {...BASE_PROPS} armed={false} />);
    expect(screen.getByTestId("pfd-armed-badge")).toHaveTextContent("Не озброєно");
  });

  it("renders airspeed, altitude, and heading tape readouts with the expected formatting", () => {
    render(<PrimaryFlightDisplay {...BASE_PROPS} />);
    expect(screen.getByText("12.3")).toBeInTheDocument(); // airspeed, 1 decimal
    expect(screen.getByText("123")).toBeInTheDocument(); // altitude, rounded to whole meters
    expect(screen.getByText("267")).toBeInTheDocument(); // heading, rounded to whole degrees
  });

  it("shows placeholder dashes for tape readouts when their telemetry hasn't arrived yet", () => {
    render(<PrimaryFlightDisplay {...BASE_PROPS} airspeed={null} altitudeM={null} headingDeg={null} />);
    expect(screen.getAllByText("--").length).toBe(3);
  });

  it("renders without crashing when roll/pitch haven't arrived yet", () => {
    render(<PrimaryFlightDisplay {...BASE_PROPS} rollRad={null} pitchRad={null} />);
    expect(screen.getByRole("img")).toBeInTheDocument();
  });
});
