import { expect, test } from "@playwright/test";

test.describe("Offline log analysis - Graphs", () => {
  test("selecting a parameter from the tree plots it", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Приклад .bin" }).click();
    await page.getByRole("tab", { name: "Графіки" }).click();

    await expect(page.getByText("Ще не обрано жодного параметра")).toBeVisible();

    await page.getByRole("button", { name: "Живлення" }).click();
    await page.getByRole("button", { name: "BAT.Volt" }).click();

    await expect(page.getByRole("list").getByText("BAT.Volt")).toBeVisible();
    await expect(page.getByTestId("timeline-chart")).toBeVisible();
  });

  test("removing the only plotted parameter shows the empty state again", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Приклад .bin" }).click();
    await page.getByRole("tab", { name: "Графіки" }).click();
    await page.getByRole("button", { name: "Живлення" }).click();
    await page.getByRole("button", { name: "BAT.Volt" }).click();
    await expect(page.getByTestId("timeline-chart")).toBeVisible();

    await page.getByRole("button", { name: "Прибрати BAT.Volt з графіка" }).click();

    await expect(page.getByText("Ще не обрано жодного параметра")).toBeVisible();
  });
});
