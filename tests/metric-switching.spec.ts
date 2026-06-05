import { test, expect } from "../playwright-fixture";
import {
  gotoIssueMap,
  metricButton,
  isMetricActive,
  METRIC_LABELS,
} from "./helpers/issueMap";

test.describe("Issue Map · metric switching", () => {
  test("switches the active metric and updates the legend heading", async ({
    page,
  }) => {
    const ok = await gotoIssueMap(page);
    test.skip(!ok, "Authenticated session required to reach /map");

    // Default metric is Total Donors and the legend reflects it.
    await expect(isMetricActive(page, "Total Donors")).resolves.toBe(true);
    await expect(page.getByText("Total Donors").first()).toBeVisible();

    // Switch to Gold Donors.
    await metricButton(page, "Gold Donors").click();
    await expect(isMetricActive(page, "Gold Donors")).resolves.toBe(true);
    await expect(isMetricActive(page, "Total Donors")).resolves.toBe(false);

    // The legend (bottom-left) should now show the Gold Donors label.
    await expect(
      page.locator(".absolute").getByText("Gold Donors").first(),
    ).toBeVisible();
  });

  test("every metric option can be activated", async ({ page }) => {
    const ok = await gotoIssueMap(page);
    test.skip(!ok, "Authenticated session required to reach /map");

    for (const label of METRIC_LABELS) {
      await metricButton(page, label).click();
      await expect(isMetricActive(page, label)).resolves.toBe(true);
    }
  });

  test("only one metric is active at a time", async ({ page }) => {
    const ok = await gotoIssueMap(page);
    test.skip(!ok, "Authenticated session required to reach /map");

    await metricButton(page, "Silver Donors").click();

    const active = await page
      .locator("header button.bg-blue-600")
      .allInnerTexts();
    // Exactly one metric button should carry the active style.
    expect(active.filter(Boolean).length).toBe(1);
  });
});
