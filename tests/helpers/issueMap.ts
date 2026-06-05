import type { Page } from "@playwright/test";
import { expect } from "../../playwright-fixture";

/**
 * Shared helpers for the Issue Map UX regression suite.
 *
 * The Issue Map (/map) renders a Mapbox canvas that resists synthetic clicks,
 * so every interaction here is driven through accessible DOM controls:
 *   - region drill-in  -> the "Search regions…" command palette
 *   - metric switching -> the desktop "Metric" button group
 *   - issue swapping    -> the issue selector dropdown ("Click to switch issue")
 *   - legend           -> the scale-mode toggle (Quantile / Linear / Log)
 *
 * All helpers assume an authenticated session (the Lovable preview is logged in).
 */

export const METRIC_LABELS = [
  "Total Donors",
  "Gold Donors",
  "Silver Donors",
  "Gold Cell Phones",
  "Silver Cell Phones",
] as const;

export const SCALE_MODES = ["Quantile", "Linear", "Log"] as const;

/**
 * Navigate to the Issue Map and wait for it to be interactive.
 * If the app redirects to a login/auth screen we skip the test rather than
 * failing on an environment without an authenticated session.
 */
export async function gotoIssueMap(page: Page) {
  await page.goto("/map");
  await page.waitForLoadState("networkidle");

  if (/\/login|\/request-access|\/application-status/.test(page.url())) {
    return false;
  }

  // The issue selector card is the most reliable "map is ready" signal.
  const ready = page.getByText(/Issues \(\d+\/\d+\)/).first();
  await expect(ready).toBeVisible({ timeout: 30000 });
  return true;
}

/** The desktop "Metric" button group (one row of toggle buttons). */
export function metricButton(page: Page, label: string) {
  return page
    .locator("header")
    .getByRole("button", { name: label, exact: true });
}

/** Returns true when the given metric button is the active (blue) one. */
export async function isMetricActive(page: Page, label: string) {
  const btn = metricButton(page, label);
  const cls = (await btn.getAttribute("class")) ?? "";
  return cls.includes("bg-blue-600");
}

/** Open the region search command palette. */
export async function openRegionSearch(page: Page) {
  await page.getByRole("button", { name: /Search regions/i }).click();
  await expect(
    page.getByPlaceholder(/Search states or districts/i),
  ).toBeVisible();
}

/** Drill into a region via the search palette and wait for the sidebar. */
export async function searchAndSelect(page: Page, query: string) {
  await openRegionSearch(page);
  await page.getByPlaceholder(/Search states or districts/i).fill(query);
  // First matching command option.
  const option = page.getByRole("option").first();
  await expect(option).toBeVisible({ timeout: 10000 });
  await option.click();
}

/** The "Quote Request" panel only renders inside the region sidebar. */
export function sidebarQuotePanel(page: Page) {
  return page.getByText(/Add to Quote Request/i);
}
