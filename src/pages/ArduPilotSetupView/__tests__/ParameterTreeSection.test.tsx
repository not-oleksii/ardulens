import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MavParamType, MavType } from "../../../mavlink/registry/registry";
import { useMavlinkParameterStore } from "../../../stores/mavlinkParameterStore/mavlinkParameterStore";
import type { ParamEntry } from "../../../stores/mavlinkParameterStore/types";
import { useMavlinkParamDefaultsStore } from "../../../stores/mavlinkParamDefaultsStore/mavlinkParamDefaultsStore";
import { ParameterTreeSection } from "../ParameterTreeSection";

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

function getView() {
  const user = userEvent.setup();
  const onLoadParameters = vi.fn();
  const onSetParam = vi.fn();
  render(<ParameterTreeSection vehicleType={MavType.QUADROTOR} onLoadParameters={onLoadParameters} onSetParam={onSetParam} />);
  return { user, onLoadParameters, onSetParam };
}

beforeEach(() => {
  // ParameterTreeSection fetches parameter documentation in the background (same as
  // ParametersPanel) - tests must never depend on real network access.
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network disabled in tests")));
});

afterEach(() => {
  useMavlinkParameterStore.getState().reset();
  useMavlinkParamDefaultsStore.getState().reset();
});

describe("ParameterTreeSection", () => {
  it("shows a Load button before any parameters have arrived", () => {
    const { onLoadParameters } = getView();
    expect(screen.getByRole("button", { name: "Завантажити параметри" })).toBeInTheDocument();
    screen.getByRole("button", { name: "Завантажити параметри" }).click();
    expect(onLoadParameters).toHaveBeenCalledTimes(1);
  });

  it("groups params into a real multi-level tree by every underscore segment, not just the first", () => {
    seedParams([
      ["ATC_ACCEL_P_MAX", 1],
      ["ATC_ACCEL_R_MAX", 2],
      ["SERVO1_FUNCTION", 3],
      ["SERVO2_FUNCTION", 4],
    ]);
    getView();

    // Top level: ATC (one folder for both ATC_ACCEL_* params) and two SEPARATE folders for
    // SERVO1/SERVO2 - no digit-collapsing into a shared "SERVO" parent.
    expect(screen.getByText("ATC")).toBeInTheDocument();
    expect(screen.getByText("SERVO1")).toBeInTheDocument();
    expect(screen.getByText("SERVO2")).toBeInTheDocument();
    // Deeper segments aren't visible until their ancestors are expanded.
    expect(screen.queryByText("ACCEL")).not.toBeInTheDocument();
    expect(screen.queryByText("FUNCTION")).not.toBeInTheDocument();
  });

  it("expanding nested folders reveals deeper segments down to the leaf param", async () => {
    seedParams([["ATC_ACCEL_P_MAX", 5]]);
    const { user } = getView();

    await user.click(screen.getByText("ATC"));
    expect(await screen.findByText("ACCEL")).toBeInTheDocument();

    await user.click(screen.getByText("ACCEL"));
    expect(await screen.findByText("P")).toBeInTheDocument();

    await user.click(screen.getByText("P"));
    expect(await screen.findByText("MAX")).toBeInTheDocument();
  });

  it("shows a prompt before any parameter is selected, and its details once one is picked", async () => {
    seedParams([["SIMPLE", 7]]);
    const { user } = getView();
    expect(screen.getByText("Виберіть параметр, щоб побачити деталі.")).toBeInTheDocument();

    await user.click(screen.getByText("SIMPLE"));
    expect(screen.getByRole("heading", { name: "SIMPLE" })).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("editing the selected param's value commits via onSetParam on Enter", async () => {
    seedParams([["SIMPLE", 7]]);
    const { user, onSetParam } = getView();
    await user.click(screen.getByText("SIMPLE"));

    await user.click(screen.getByRole("button", { name: "7" }));
    const input = screen.getByDisplayValue("7");
    await user.clear(input);
    await user.type(input, "9{Enter}");

    expect(onSetParam).toHaveBeenCalledWith("SIMPLE", 9, MavParamType.REAL32);
  });

  it("shows the known default value for the selected param, once loaded", async () => {
    seedParams([["SIMPLE", 7]]);
    useMavlinkParamDefaultsStore.getState().setDone({ SIMPLE: 3 });
    const { user } = getView();
    await user.click(screen.getByText("SIMPLE"));
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("search hides branches with no matching param anywhere inside them", async () => {
    seedParams([
      ["ATC_ACCEL_P_MAX", 1],
      ["SERVO1_FUNCTION", 2],
    ]);
    const { user } = getView();

    await user.type(screen.getByPlaceholderText("Пошук параметрів..."), "servo");
    expect(screen.queryByText("ATC")).not.toBeInTheDocument();
    expect(screen.getByText("SERVO1")).toBeInTheDocument();
    // Matching branches auto-expand under search, unlike the collapsed-by-default browse mode.
    expect(await screen.findByText("FUNCTION")).toBeInTheDocument();
  });
});
