import { expect, test } from "@playwright/test";

test.describe("Offline log analysis - Logs", () => {
  test("loading the sample .bin lands on a real Logs table", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("home-card").click();
    await page.getByRole("button", { name: "Приклад .bin" }).click();

    await expect(page.getByRole("heading", { name: "Дані з логів" })).toBeVisible();
    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    // The sample .bin is a real single-board flight - at least one data row beyond the header.
    await expect(table.locator("tbody tr")).not.toHaveCount(0);
  });

  test("loading the sample .skylog shows multiple boards", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("home-card").click();
    await page.getByRole("button", { name: "Приклад .skylog" }).click();

    await expect(page.getByText(/У лозі кілька бортів/)).toBeVisible();
  });

  test("board filter narrows the table live", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("home-card").click();
    await page.getByRole("button", { name: "Приклад .skylog" }).click();
    // The bundled sample .skylog has two real boards, 3570 and 3526 (confirmed via the
    // multi-board alert's own text rather than assumed).
    await expect(page.getByText(/У лозі кілька бортів: 3570, 3526/)).toBeVisible();
    const rowsBefore = await page.locator("tbody tr").count();
    expect(rowsBefore).toBeGreaterThan(1);

    await page.getByLabel(/Фільтр за бортом/).fill("3570");

    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.getByRole("cell", { name: "3570" })).toBeVisible();
  });
});
