import { expect, test } from "@playwright/test";

test.describe("Live ArduPilot Setup - Live tuning", () => {
  test("is gated to ArduCopter only, showing a coming-soon notice for a plane vehicle", async ({ page }) => {
    await page.goto("/ardupilot-setup");
    await page.getByRole("button", { name: "Режим розробника", exact: true }).click();
    await expect(page.getByText("Підключено: Dev mode (simulated vehicle)")).toBeVisible();

    await page.getByRole("button", { name: "Налаштування", exact: true }).click();
    await page.getByRole("tab", { name: "Тюнінг наживо", exact: true }).click();

    await expect(
      page.getByText(
        "Тюнінг наживо через передавач (RCx_OPTION=219) поки підтримується лише для ArduCopter.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Завантажити параметри тюнінгу" })).not.toBeVisible();
  });

  test("loads tuning parameters for a copter vehicle", async ({ page }) => {
    await page.goto("/ardupilot-setup");
    await page.getByRole("button", { name: "Режим розробника (мультикоптер)", exact: true }).click();
    await expect(page.getByText("Підключено: Dev mode (simulated vehicle)")).toBeVisible();

    await page.getByRole("button", { name: "Налаштування", exact: true }).click();
    await page.getByRole("tab", { name: "Тюнінг наживо", exact: true }).click();

    // Dev Mode auto-loads the full param set on connect (TUNE/TUNE_MIN/TUNE_MAX included), so
    // this section is already past its "not loaded" state by the time it's reachable.
    await expect(page.getByRole("button", { name: "Завантажити параметри тюнінгу" })).toBeVisible();
    await expect(page.getByText("Призначте канал передавача вище, щоб побачити значення наживо.")).toBeVisible();
  });
});
