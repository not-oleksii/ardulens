import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ONBOARDING_NUDGE_DISMISSED_STORAGE_KEY } from "../../../constants";
import { OnboardingNudge } from "../OnboardingNudge";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("OnboardingNudge", () => {
  it("shows the suggested setup order as five step buttons", () => {
    render(<OnboardingNudge onNavigate={vi.fn()} />);
    expect(screen.getByText("Новий апарат?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Калібрування акселерометра/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Калібрування компаса/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Калібрування RC/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Налаштування моторів/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Налаштування PID/ })).toBeInTheDocument();
  });

  it("calls onNavigate with the matching section when a step is clicked", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<OnboardingNudge onNavigate={onNavigate} />);

    await user.click(screen.getByRole("button", { name: /Калібрування компаса/ }));

    expect(onNavigate).toHaveBeenCalledWith("compassCal");
  });

  it("dismissing hides the nudge and persists the choice to localStorage", async () => {
    const user = userEvent.setup();
    render(<OnboardingNudge onNavigate={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Закрити" }));

    expect(screen.queryByText("Новий апарат?")).not.toBeInTheDocument();
    expect(localStorage.getItem(ONBOARDING_NUDGE_DISMISSED_STORAGE_KEY)).toBe("1");
  });

  it("doesn't render at all if already dismissed in a previous session", () => {
    localStorage.setItem(ONBOARDING_NUDGE_DISMISSED_STORAGE_KEY, "1");
    render(<OnboardingNudge onNavigate={vi.fn()} />);
    expect(screen.queryByText("Новий апарат?")).not.toBeInTheDocument();
  });
});
