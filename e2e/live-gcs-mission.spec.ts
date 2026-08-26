import { expect, test } from "@playwright/test";

test.describe("Live ArduPilot Setup - Mission download", () => {
  test("downloading the mission from the vehicle shows its waypoints", async ({ page }) => {
    await page.goto("/ardupilot-setup");
    await page.getByRole("button", { name: "Налаштування застосунку" }).click();
    await page.getByRole("button", { name: "Підключити (літак)", exact: true }).click();
    await expect(page.getByText("Підключено: Dev mode (simulated vehicle)")).toBeVisible();

    await page.getByRole("button", { name: "Планування" }).click();
    await page.getByRole("tab", { name: "План місії", exact: true }).click();

    await page.getByRole("button", { name: "Завантажити з апарата" }).click();

    // The mock simulator returns a fixed 3-item mission (2 waypoints + 1 RTL).
    await expect(page.getByRole("button", { name: /Точки маршруту \(3\)/ })).toBeVisible();
  });
});
