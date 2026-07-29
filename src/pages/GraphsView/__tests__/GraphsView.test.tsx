import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SkylogFileBuilder } from "../../../builders/SkylogFileBuilder/SkylogFileBuilder";
import { GraphsView } from "../GraphsView";

const { MockUplot } = vi.hoisted(() => {
  const MockUplot = vi.fn().mockImplementation(function mockUplotCtor(this: Record<string, unknown>) {
    this["destroy"] = vi.fn();
    this["setScale"] = vi.fn();
    this["setSize"] = vi.fn();
  });
  (MockUplot as unknown as { join: (tables: unknown[][]) => unknown }).join = vi.fn((tables: unknown[][]) => [
    "x",
    ...tables.map((t) => t[1]),
  ]);
  return { MockUplot };
});
vi.mock("uplot", () => ({ default: MockUplot }));

describe("GraphsView", () => {
  it("renders the heading and description", () => {
    render(<GraphsView />);
    expect(screen.getByRole("heading", { name: "Графіки" })).toBeInTheDocument();
  });

  it("loading a sample .bin shows plots setup, presets, and the parameter tree, with an empty chart placeholder", async () => {
    const user = userEvent.setup();
    render(<GraphsView />);

    await user.click(screen.getByRole("button", { name: "Приклад .bin" }));

    expect(await screen.findByText("Ще не обрано жодного параметра - оберіть пресет або параметр нижче.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Батарея (напруга і струм)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Орієнтація" })).toBeInTheDocument();
    expect(screen.getByTestId("timeline-chart-empty")).toBeInTheDocument();
  });

  it("clicking a preset adds all its params to Plots Setup and renders the chart", async () => {
    const user = userEvent.setup();
    render(<GraphsView />);
    await user.click(screen.getByRole("button", { name: "Приклад .bin" }));
    await screen.findByRole("button", { name: "Батарея (напруга і струм)" });

    await user.click(screen.getByRole("button", { name: "Батарея (напруга і струм)" }));

    expect(screen.getByText("BAT.Volt")).toBeInTheDocument();
    expect(screen.getByText("BAT.Curr")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-chart")).toBeInTheDocument();
    expect(screen.queryByTestId("timeline-chart-empty")).not.toBeInTheDocument();
  });

  it("toggles an individual parameter on and off via the category tree", async () => {
    const user = userEvent.setup();
    render(<GraphsView />);
    await user.click(screen.getByRole("button", { name: "Приклад .bin" }));
    await screen.findByRole("button", { name: "Орієнтація" });

    await user.click(screen.getByRole("button", { name: "Орієнтація" }));
    await user.click(screen.getByRole("button", { name: "ATT.Roll" }));

    expect(within(screen.getByRole("list")).getByText("ATT.Roll")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "ATT.Roll" }));
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("removes a plotted parameter via its trash button", async () => {
    const user = userEvent.setup();
    render(<GraphsView />);
    await user.click(screen.getByRole("button", { name: "Приклад .bin" }));
    await user.click(await screen.findByRole("button", { name: "Швидкість польоту" }));
    expect(screen.getByText("ARSP.Airspeed")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Прибрати ARSP.Airspeed з графіка" }));

    expect(screen.queryByText("ARSP.Airspeed")).not.toBeInTheDocument();
  });

  it("clears every plotted parameter with the reset button", async () => {
    const user = userEvent.setup();
    render(<GraphsView />);
    await user.click(screen.getByRole("button", { name: "Приклад .bin" }));
    await user.click(await screen.findByRole("button", { name: "Батарея (напруга і струм)" }));
    expect(screen.getByText("BAT.Volt")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Очистити всі графіки" }));

    expect(screen.queryByText("BAT.Volt")).not.toBeInTheDocument();
    expect(screen.getByTestId("timeline-chart-empty")).toBeInTheDocument();
  });

  it("loading a sample .skylog only offers its fixed telemetry fields and matching presets", async () => {
    const user = userEvent.setup();
    render(<GraphsView />);

    await user.click(screen.getByRole("button", { name: "Приклад .skylog" }));

    expect(await screen.findByRole("button", { name: "Телеметрія" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Батарея (напруга і струм)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Орієнтація (крен/тангаж/рискання)" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Канали пульта (RC)" })).not.toBeInTheDocument();
  });

  it("surfaces the parser's error for a skylog missing -extended_log", async () => {
    render(<GraphsView />);
    const buf = new SkylogFileBuilder().addBoard({ board: 1001 }).withoutExtendedLog().build();
    const input = screen.getByTestId("graphs-file-input");
    await userEvent.upload(input, new File([buf], "raw.skylog"));

    expect(await screen.findByText(/Скористайтесь \.bin/)).toBeInTheDocument();
  });

  it("parses a file dropped onto the drop zone", async () => {
    render(<GraphsView />);
    const buf = new SkylogFileBuilder().addBoard({ board: 3570 }).build();
    const file = new File([buf], "sample.skylog");
    const dropzone = screen.getByTestId("graphs-dropzone");

    const dataTransfer = { files: [file] };
    const dropEvent = new Event("drop", { bubbles: true, cancelable: true }) as unknown as Event & {
      dataTransfer: typeof dataTransfer;
    };
    dropEvent.dataTransfer = dataTransfer;
    dropzone.dispatchEvent(dropEvent);

    expect(await within(document.body).findByRole("button", { name: "Телеметрія" })).toBeInTheDocument();
  });
});
