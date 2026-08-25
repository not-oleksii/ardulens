import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "../toaster";
import { toast, useToastStore } from "@/stores/toastStore/toastStore";

afterEach(() => {
  useToastStore.setState({ toasts: [] });
});

describe("Toaster", () => {
  it("renders a pushed toast with its title, description, and variant", async () => {
    render(<Toaster />);

    toast({ variant: "good", title: "Parameters written", description: "3 of 3 confirmed by the vehicle." });

    expect(await screen.findByText("Parameters written")).toBeInTheDocument();
    expect(screen.getByText("3 of 3 confirmed by the vehicle.")).toBeInTheDocument();
  });

  it("renders multiple pushed toasts stacked together", async () => {
    render(<Toaster />);

    toast({ variant: "warning", description: "First toast" });
    toast({ variant: "critical", description: "Second toast" });

    expect(await screen.findByText("First toast")).toBeInTheDocument();
    expect(screen.getByText("Second toast")).toBeInTheDocument();
  });

  it("auto-dismisses after its duration elapses", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame"] });
    try {
      render(<Toaster />);
      toast({ variant: "info", description: "Auto-dismiss me", duration: 1000 });

      await vi.advanceTimersByTimeAsync(50); // let the enter transition's rAF flip phase to "open"
      expect(screen.getByText("Auto-dismiss me")).toBeInTheDocument();

      await vi.advanceTimersByTimeAsync(1000); // auto-close timer fires, starts the leave transition
      await vi.advanceTimersByTimeAsync(200); // leave transition completes, onDismiss removes it

      expect(screen.queryByText("Auto-dismiss me")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("never auto-dismisses when duration is Infinity", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame"] });
    try {
      render(<Toaster />);
      toast({ variant: "critical", description: "Stays until closed", duration: Infinity });

      await vi.advanceTimersByTimeAsync(50);
      await vi.advanceTimersByTimeAsync(60_000);

      expect(screen.getByText("Stays until closed")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("dismisses immediately when its close button is clicked", async () => {
    const user = userEvent.setup();
    render(<Toaster />);
    toast({ variant: "good", description: "Close me", duration: Infinity });
    await screen.findByText("Close me");

    await user.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => expect(screen.queryByText("Close me")).not.toBeInTheDocument());
  });
});
