import { expect, test } from "@playwright/test";

// All four sections here live under the "Діагностика" sidebar category, which starts
// collapsed - each test expands it first (a real click is needed, not just a DOM query,
// since the category's max-height collapse isn't hit-testable by Playwright until expanded).
async function connectAndOpenDiagnostics(page: import("@playwright/test").Page) {
  await page.goto("/ardupilot-setup");
  await page.getByRole("button", { name: "Режим розробника", exact: true }).click();
  await expect(page.getByText("Підключено: Dev mode (simulated vehicle)")).toBeVisible();
  await page.getByRole("button", { name: "Діагностика" }).click();
}

test.describe("Live ArduPilot Setup - MAVLink Inspector", () => {
  test("shows live incoming messages, and selecting one reveals its decoded fields", async ({ page }) => {
    await connectAndOpenDiagnostics(page);
    await page.getByRole("tab", { name: "Інспектор MAVLink", exact: true }).click();

    // Purely a passive live stream - HEARTBEAT starts accumulating the moment Dev Mode
    // connects, independent of which tab is active, so no extra action is needed to see it.
    const heartbeatRow = page.getByRole("button", { name: /HEARTBEAT/ });
    await expect(heartbeatRow).toBeVisible();

    await heartbeatRow.click();
    await expect(page.getByText("autopilot")).toBeVisible();
    await expect(page.getByText("custom_mode")).toBeVisible();
  });
});

test.describe("Live ArduPilot Setup - Servo/Relay", () => {
  test("shows live channel state and the propeller safety warning without sending any override", async ({
    page,
  }) => {
    await connectAndOpenDiagnostics(page);
    await page.getByRole("tab", { name: "Серво/Реле", exact: true }).click();

    // Renders immediately from live telemetry, no load button - and all 6 relays default OFF.
    await expect(page.getByText(/зніміть гвинти/i)).toBeVisible();
    await expect(page.getByText("ВИМК")).toHaveCount(6);
  });
});

test.describe("Live ArduPilot Setup - DataFlash Logs", () => {
  test("refreshing the list shows the vehicle's stored logs", async ({ page }) => {
    await connectAndOpenDiagnostics(page);
    await page.getByRole("tab", { name: "DataFlash Логи", exact: true }).click();

    await expect(page.getByText('Натисніть "Оновити список"')).toBeVisible();
    await page.getByRole("button", { name: "Оновити список" }).click();

    // The mock simulator returns 3 fake log entries.
    await expect(page.getByRole("columnheader", { name: "Розмір (байт)" })).toBeVisible();
    await expect(page.getByRole("row")).toHaveCount(4);
  });
});

test.describe("Live ArduPilot Setup - Serial ports", () => {
  test("loading settings shows all 10 serial ports with the reboot-required warning", async ({ page }) => {
    await connectAndOpenDiagnostics(page);
    await page.getByRole("tab", { name: "Послідовні порти", exact: true }).click();

    await expect(page.getByText(/набудуть чинності лише після перезавантаження плати/)).toBeVisible();
    await page.getByRole("button", { name: "Завантажити налаштування портів" }).click();

    // SERIAL0-SERIAL9 always render once loaded, regardless of how many the mock defines.
    await expect(page.getByRole("columnheader", { name: "Протокол" })).toBeVisible();
    await expect(page.getByRole("row")).toHaveCount(11);
  });
});
