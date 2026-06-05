import { test, expect } from "../playwright-fixture";
import {
  gotoIssueMap,
  searchAndSelect,
  sidebarQuotePanel,
} from "./helpers/issueMap";

/**
 * Region drill-in is exercised through the search command palette (the Mapbox
 * canvas resists synthetic clicks). Selecting a state opens the state sidebar
 * with a drill-in hint; selecting a district opens the district sidebar.
 */
test.describe("Issue Map · region drill-in", () => {
  test("selecting a state opens the sidebar with a drill-in hint", async ({
    page,
  }) => {
    const ok = await gotoIssueMap(page);
    test.skip(!ok, "Authenticated session required to reach /map");

    await searchAndSelect(page, "Texas");

    // State sidebar shows the "State rollup" subtitle and the drill-in hint.
    await expect(page.getByText(/State rollup/i)).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByText(/Click the state again to view its congressional districts/i),
    ).toBeVisible();
    await expect(sidebarQuotePanel(page)).toBeVisible();
  });

  test("selecting a district opens the district sidebar", async ({ page }) => {
    const ok = await gotoIssueMap(page);
    test.skip(!ok, "Authenticated session required to reach /map");

    // District codes look like "TX-01"; search by a state name then pick a district.
    await searchAndSelect(page, "TX-");

    await expect(page.getByRole("heading", { name: /District/i })).toBeVisible({
      timeout: 15000,
    });
    await expect(sidebarQuotePanel(page)).toBeVisible();
  });

  test("the sidebar can be closed", async ({ page }) => {
    const ok = await gotoIssueMap(page);
    test.skip(!ok, "Authenticated session required to reach /map");

    await searchAndSelect(page, "California");
    await expect(page.getByText(/State rollup/i)).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: /^Close$/i }).click();
    await expect(page.getByText(/State rollup/i)).not.toBeVisible();
  });
});
