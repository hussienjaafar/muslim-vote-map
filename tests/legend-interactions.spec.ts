import { test, expect } from "../playwright-fixture";
import { gotoIssueMap, SCALE_MODES } from "./helpers/issueMap";

/**
 * The legend (desktop, bottom-left) exposes a scale-mode toggle
 * (Quantile / Linear / Log) that re-colors the choropleth. Each toggle button
 * carries a tooltip describing the scale.
 */
test.describe("Issue Map · legend interactions", () => {
  test("legend renders the active metric and a scale toggle", async ({
    page,
  }) => {
    const ok = await gotoIssueMap(page);
    test.skip(!ok, "Authenticated session required to reach /map");

    for (const mode of SCALE_MODES) {
      await expect(
        page.getByRole("button", { name: mode, exact: true }),
      ).toBeVisible();
    }
  });

  test("switching scale mode activates the chosen toggle", async ({ page }) => {
    const ok = await gotoIssueMap(page);
    test.skip(!ok, "Authenticated session required to reach /map");

    const linear = page.getByRole("button", { name: "Linear", exact: true });
    await linear.click();
    await expect.poll(async () =>
      ((await linear.getAttribute("class")) ?? "").includes("bg-blue-600"),
    ).toBe(true);

    const log = page.getByRole("button", { name: "Log", exact: true });
    await log.click();
    await expect.poll(async () =>
      ((await log.getAttribute("class")) ?? "").includes("bg-blue-600"),
    ).toBe(true);
    // Linear should no longer be active.
    await expect.poll(async () =>
      ((await linear.getAttribute("class")) ?? "").includes("bg-blue-600"),
    ).toBe(false);
  });

  test("scale mode persists across reload via localStorage", async ({
    page,
  }) => {
    const ok = await gotoIssueMap(page);
    test.skip(!ok, "Authenticated session required to reach /map");

    await page.getByRole("button", { name: "Log", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("issueMap.scaleMode")))
      .toBe("log");

    await page.reload();
    await page.waitForLoadState("networkidle");

    await expect
      .poll(async () =>
        (
          (await page
            .getByRole("button", { name: "Log", exact: true })
            .getAttribute("class")) ?? ""
        ).includes("bg-blue-600"),
      )
      .toBe(true);
  });
});
