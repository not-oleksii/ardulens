import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MavParamType, MavType } from "../../../mavlink/registry/registry";
import { useMavlinkParameterStore } from "../../../stores/mavlinkParameterStore/mavlinkParameterStore";
import type { ParamEntry } from "../../../stores/mavlinkParameterStore/types";
import { LiveTuningSection } from "../LiveTuningSection";

function entry(name: string, value: number, index: number): ParamEntry {
  return { name, value, type: MavParamType.REAL32, index, updatedAt: 0, dirty: false };
}

function seedParams(names: [string, number][]) {
  useMavlinkParameterStore
    .getState()
    .setParams(
      names.map(([name, value], index) => entry(name, value, index)),
      names.length,
    );
}

function getView(live: Record<number, number> = {}) {
  const user = userEvent.setup();
  const onLoad = vi.fn();
  const onSetParam = vi.fn();
  const utils = render(<LiveTuningSection vehicleType={MavType.QUADROTOR} live={live} onLoad={onLoad} onSetParam={onSetParam} />);
  return { user, onLoad, onSetParam, ...utils };
}

beforeEach(() => {
  // LiveTuningSection fetches parameter documentation in the background (same as RcSetupSection/
  // PidTuneSection) - tests fall back to the bundled TUNE_PARAM_NAMES_COPTER snapshot and must
  // never depend on real network access.
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network disabled in tests")));
});

afterEach(() => {
  useMavlinkParameterStore.getState().reset();
});

describe("LiveTuningSection", () => {
  it("shows a coming-soon message for a non-Copter vehicle type", () => {
    const user = userEvent.setup();
    const onLoad = vi.fn();
    render(<LiveTuningSection vehicleType={MavType.FIXED_WING} live={{}} onLoad={onLoad} onSetParam={vi.fn()} />);
    expect(screen.getByText("Тюнінг наживо")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Завантажити параметри тюнінгу" })).not.toBeInTheDocument();
    void user; // unused - render-only assertion
  });

  it("shows a Load button before any tuning parameters have arrived", () => {
    const { onLoad } = getView();
    expect(screen.getByText("Параметри тюнінгу ще не завантажено.")).toBeInTheDocument();
    screen.getByRole("button", { name: "Завантажити параметри тюнінгу" }).click();
    expect(onLoad).toHaveBeenCalledTimes(1);
  });

  it("shows no channel assigned yet by default, once params arrive", () => {
    seedParams([
      ["TUNE", 1],
      ["TUNE_MIN", 0],
      ["TUNE_MAX", 1],
    ]);
    getView();
    expect(screen.getByText("Призначте канал передавача вище, щоб побачити значення наживо.")).toBeInTheDocument();
  });

  it("assigning a channel sets its RCx_OPTION to 219 via onSetParam", async () => {
    seedParams([
      ["TUNE", 1],
      ["TUNE_MIN", 0],
      ["TUNE_MAX", 1],
      ["RC6_OPTION", 0],
    ]);
    const { user, onSetParam } = getView();
    await user.selectOptions(screen.getByLabelText("Канал передавача"), "6");
    expect(onSetParam).toHaveBeenCalledWith("RC6_OPTION", 219, MavParamType.REAL32);
  });

  it("reassigning the channel clears the previous one's RCx_OPTION back to 0", async () => {
    seedParams([
      ["TUNE", 1],
      ["TUNE_MIN", 0],
      ["TUNE_MAX", 1],
      ["RC6_OPTION", 219],
      ["RC7_OPTION", 0],
    ]);
    const { user, onSetParam } = getView();
    await user.selectOptions(screen.getByLabelText("Канал передавача"), "7");
    expect(onSetParam).toHaveBeenCalledWith("RC6_OPTION", 0, MavParamType.REAL32);
    expect(onSetParam).toHaveBeenCalledWith("RC7_OPTION", 219, MavParamType.REAL32);
  });

  it("derives the live tuned value by interpolating the assigned channel's PWM through RCx_MIN/MAX into TUNE_MIN/MAX", () => {
    seedParams([
      ["TUNE", 1],
      ["TUNE_MIN", 0],
      ["TUNE_MAX", 2],
      ["RC6_OPTION", 219],
      ["RC6_MIN", 1000],
      ["RC6_MAX", 2000],
    ]);
    getView({ 6: 1500 }); // channel midpoint -> midpoint of [0,2] = 1
    expect(screen.getByText("1.000")).toBeInTheDocument();
  });

  it("editing TUNE_MIN commits via onSetParam on Enter", async () => {
    seedParams([
      ["TUNE", 1],
      ["TUNE_MIN", 0],
      ["TUNE_MAX", 1],
    ]);
    const { user, onSetParam } = getView();
    await user.click(screen.getByRole("button", { name: "0" }));
    const input = screen.getByDisplayValue("0");
    await user.clear(input);
    await user.type(input, "0.5{Enter}");
    expect(onSetParam).toHaveBeenCalledWith("TUNE_MIN", 0.5, MavParamType.REAL32);
  });

  it("changing the tuned parameter select commits via onSetParam", async () => {
    seedParams([
      ["TUNE", 1],
      ["TUNE_MIN", 0],
      ["TUNE_MAX", 1],
    ]);
    const { user, onSetParam } = getView();
    await user.selectOptions(screen.getByDisplayValue("Stab Roll/Pitch kP"), "4");
    expect(onSetParam).toHaveBeenCalledWith("TUNE", 4, MavParamType.REAL32);
  });
});
