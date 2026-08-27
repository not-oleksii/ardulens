import { expect, test } from "@playwright/test";

test.describe("Offline log analysis - GeoTag", () => {
  test("shows the desktop-only gate in the plain browser build", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("home-card").click();
    await page.getByRole("button", { name: "Приклад .bin" }).click();
    await page.getByRole("tab", { name: "GeoTag" }).click();

    await expect(page.getByText(/GeoTag потребує десктопний застосунок/)).toBeVisible();
  });
});

test.describe("Offline log analysis - Map", () => {
  test("shows the Cesium token entry gate on first visit", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("home-card").click();
    await page.getByRole("button", { name: "Приклад .bin" }).click();
    await page.getByRole("tab", { name: "Карта" }).click();

    await expect(page.getByPlaceholder("Вставте сюди свій токен Cesium ion")).toBeVisible();
  });
});
