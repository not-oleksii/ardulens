import { expect, test } from "@playwright/test";

// Deliberately never clicks "Утримуйте для тесту" / "Почати ідентифікацію" / any motor-spin
// or frame-diagram control - those send a real (mock) nonzero-throttle motor command, which
// isn't something an automated regression spec should trigger even against a simulator.
test.describe("Live ArduPilot Setup - Motors & servos (plane)", () => {
  test("loading servo outputs shows the per-channel table without touching any test control", async ({
    page,
  }) => {
    await page.goto("/ardupilot-setup");
    await page.getByRole("button", { name: "Налаштування застосунку" }).click();
    await page.getByRole("button", { name: "Режим розробника", exact: true }).click();
    await expect(page.getByText("Підключено: Dev mode (simulated vehicle)")).toBeVisible();

    await page.getByRole("button", { name: "Налаштування", exact: true }).click();
    await page.getByRole("tab", { name: "Налаштування моторів", exact: true }).click();

    await page.getByRole("button", { name: "Завантажити виходи серво" }).click();

    await expect(page.getByRole("columnheader", { name: "Тест" })).toBeVisible();
    const rows = await page.getByRole("row").count();
    expect(rows).toBeGreaterThan(1);
  });
});

test.describe("Live ArduPilot Setup - Motors & servos (copter)", () => {
  test("loading motor config opens the setup wizard on the frame step", async ({ page }) => {
    await page.goto("/ardupilot-setup");
    await page.getByRole("button", { name: "Налаштування застосунку" }).click();
    await page.getByRole("button", { name: "Режим розробника (мультикоптер)", exact: true }).click();
    await expect(page.getByText("Підключено: Dev mode (simulated vehicle)")).toBeVisible();

    await page.getByRole("button", { name: "Налаштування", exact: true }).click();
    await page.getByRole("tab", { name: "Налаштування моторів", exact: true }).click();

    // Dev Mode auto-loads the full param set on connect (FRAME_CLASS/FRAME_TYPE included), so
    // the wizard is already showing its "Рама" step by the time this section is reachable -
    // "Завантажити налаштування моторів" only renders before those two params exist.
    // Wizard opens on step 1 ("Рама") by default - never advance to the "Тест і реверс" step.
    // Names are specific enough to not need tablist scoping (sidebar's own tablist uses
    // different labels like "Налаштування моторів", not "1. Рама").
    await expect(page.getByRole("tab", { name: /1\. Рама/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /2\. Тест і реверс/ })).toBeVisible();
    await expect(page.getByText("Клас рами")).toBeVisible();
  });
});
