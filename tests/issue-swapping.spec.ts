import { test, expect } from "../playwright-fixture";
import { gotoIssueMap } from "./helpers/issueMap";

/**
 * Issue swapping happens in the top-left issue selector: each selected issue is
 * a dropdown trigger (title="Click to switch issue") that lists the remaining
 * issues; choosing one replaces the issue in place without adding a second.
 */
test.describe("Issue Map · issue swapping", () => {
  test("swaps the selected issue in place", async ({ page }) => {
    const ok = await gotoIssueMap(page);
    test.skip(!ok, "Authenticated session required to reach /map");

    const trigger = page.getByRole("button", { name: /Click to switch issue/i }).first();
    await expect(trigger).toBeVisible();

    const before = (await trigger.innerText()).trim();

    await trigger.click();
    const menuItems = page.getByRole("menuitem");
    const count = await menuItems.count();
    test.skip(count === 0, "Only one issue exists — nothing to swap to");

    const target = menuItems.first();
    const targetName = (await target.innerText()).trim();
    await target.click();

    // Selection count stays at one issue (swap, not add).
    await expect(page.getByText(/Issues \(1\/\d+\)/)).toBeVisible();

    // The visible issue label changed to the chosen one.
    const after = (await page
      .getByRole("button", { name: /Click to switch issue/i })
      .first()
      .innerText()).trim();
    expect(after).not.toBe(before);
    expect(targetName).toContain(after.replace(/\s+/g, " ").trim().split("\n")[0] ?? after);
  });

  test("swap dropdown excludes the currently selected issue", async ({ page }) => {
    const ok = await gotoIssueMap(page);
    test.skip(!ok, "Authenticated session required to reach /map");

    const trigger = page.getByRole("button", { name: /Click to switch issue/i }).first();
    const current = (await trigger.innerText()).trim();

    await trigger.click();
    const items = await page.getByRole("menuitem").allInnerTexts();
    test.skip(items.length === 0, "Only one issue exists");

    expect(items.map((t) => t.trim())).not.toContain(current);
  });
});
