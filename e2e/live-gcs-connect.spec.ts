import { expect, test } from "@playwright/test";

// "Dev Mode" is an in-process mock vehicle simulator with zero Tauri dependency (see
// ArduPilotSetupView.tsx's handleConnectMockAs), so it's reachable from the plain preview
// build these E2E specs run against - no real serial/UDP or Tauri window involved.
test.describe("Live ArduPilot Setup - connecting via Dev Mode", () => {
  test("Dev Mode connects and lands on the Telemetry section", async ({ page }) => {
    await page.goto("/ardupilot-setup");
    await expect(page.getByRole("heading", { name: "Налаштування ArduPilot" })).toBeVisible();

    await page.getByRole("button", { name: "Налаштування застосунку" }).click();
    await page.getByRole("button", { name: "Режим розробника", exact: true }).click();

    await expect(page.getByText("Підключено: Dev mode (simulated vehicle)")).toBeVisible();
    // Telemetry is the default/starting section - visible immediately, no nav click needed.
    await expect(page.getByPlaceholder("Вставте сюди свій токен Cesium ion")).toBeVisible();
  });

  test("sidebar sections become reachable once connected", async ({ page }) => {
    await page.goto("/ardupilot-setup");
    await page.getByRole("button", { name: "Налаштування застосунку" }).click();
    await page.getByRole("button", { name: "Режим розробника", exact: true }).click();
    await expect(page.getByText("Підключено: Dev mode (simulated vehicle)")).toBeVisible();

    // "Параметри" lives inside the collapsed "Діагностика" sidebar category - a real click
    // needs it expanded first (the tab is DOM-present but visually clipped via max-height
    // while its category is closed, so it isn't really hit-testable until then).
    await page.getByRole("button", { name: "Діагностика" }).click();
    await page.getByRole("tab", { name: "Параметри", exact: true }).click();

    // Dev Mode auto-loads parameters on connect, so by the time this section is reachable
    // it has already started (150/151 received) - "Завантажити параметри" only shows before
    // any load has begun, so the loaded state's own controls are what's actually visible.
    await expect(page.getByRole("button", { name: "Запросити відсутні" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Зберегти у файл" })).toBeVisible();
  });
});
