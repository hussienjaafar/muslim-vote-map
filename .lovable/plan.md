# Fix: Orders don't say which issue the data is for

## Problem
Orders placed from the Issue Map only record a generic product tier (e.g. "Issue Donors — Gold") and a region (e.g. "District TX-020"). The Issue Map is issue-scoped, but the **selected issue is never saved** on the cart or order line. Worse, the "Add to Quote Request" button sums record counts across *all* selected issues into one line, so even the per-issue counts are lost. Your team can't fulfill because they don't know which issue's donors/phones were requested.

## Goal
Every quote line carries the exact **issue** it belongs to, as **one line per issue**, with that issue's own record count. Admins see the issue on the order detail page. Best-effort backfill of existing orders.

## Approach

### 1. Database: add issue columns
Add to both `data_cart_items` and `data_order_items`:
- `issue_id uuid` (nullable, references `issues.id`)
- `issue_name text` (denormalized snapshot so the label survives even if an issue is later renamed/removed)

Update the cart upsert conflict key so the same product in the same region but for a *different issue* is treated as a distinct line (conflict on `user_id, product_id, geo_type, geo_code, issue_id`).

### 2. Add-to-cart: split per issue, attach issue
- **Issue Map sidebar** (`IssueRegionSidebar.tsx` → `AddToQuoteSection`): instead of summing across selected issues, render the product list per selected issue (or, when multiple issues are selected, add one cart line per issue when a product is clicked). Each line gets that issue's `issue_id`, `issue_name`, and that issue's own record count for the product's `source_field`.
- **Home page** (`Home.tsx`) and **RecommendedDistricts** (`RecommendedDistricts.tsx`): these already operate on a single active issue — pass that `issue_id`/`issue_name` into the add-to-cart call.
- `useAddToCart` (`useDataProductQueries.ts`): accept and persist `issue_id` + `issue_name`.

### 3. Carry issue into orders
- `DataCart.tsx` `handleRequestQuote`: copy `issue_id` and `issue_name` from each cart item onto the inserted `data_order_items`. Show the issue name on each cart line in the drawer.

### 4. Admin order detail
- `OrderDetail.tsx`: add an "Issue" column to the Order Items table (falls back to "—" for legacy rows without an issue).

### 5. Backfill existing orders (best effort)
For historical `data_order_items` where `issue_id` is null:
- If the region + product line can be matched to exactly one issue that has data for that district/tier, set it.
- Where the original selection is ambiguous (multiple issues had data, which is common), it cannot be reliably recovered — those rows stay `—`. We'll report how many were backfilled vs. left ambiguous after running it.

## Technical notes
- Migration adds the two nullable columns to both tables plus the new unique index on `data_cart_items`; existing GRANTs/RLS unchanged.
- Backfill runs as a data update (not migration) after the schema lands and the types regenerate.
- No pricing/terminology changes — stays quote-only.

## Out of scope
- Changing the product catalog or tier definitions.
- Any pricing display.
