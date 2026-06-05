## Goal

Run a deep, end-to-end test of the audience cart → order flow, driving the live preview as the currently logged-in user, verifying both database state and the admin side, then cleaning up all test records.

## How the flow works (verified in code)

```text
USER SIDE
 Map region selected → DataProductSelector drawer
   → useAddToCart → data_cart_items (upsert, user_id + org)
   → DataCart drawer → "Request Quote"
       → insert data_orders (status=pending)
       → insert data_order_items
       → clear data_cart_items
       → logActivity('submit_order')
       → trackInitiateCheckout (Meta Pixel)
       → notify-admins edge function (type=new_order)
       → toast: "Quote request submitted!"

ADMIN SIDE  (/admin/orders)
   order appears as "pending"
   → OrderDetail: customer, items, total
   → Fulfill  → status=fulfilled + notify-admins(order_fulfilled)
   → Cancel   → status=cancelled + notify-admins(order_cancelled)
```

## Test procedure (browser automation in preview)

### Phase 1 — Capture baseline
- Read the logged-in user's id/email from the preview session.
- Snapshot current `data_cart_items`, `data_orders`, `data_order_items` rows for that user so I can confirm exactly which rows the test creates.

### Phase 2 — Add audience to cart (UI)
- Navigate to the map, select a region with available audience records.
- Open the data/audience selector, check one or more products, click "Add to Cart".
- Verify: success toast, and a new `data_cart_items` row with correct `product_id`, `geo_code`, `geo_name`, `record_count`, `user_id`.

### Phase 3 — Place the order (UI)
- Open the cart drawer; confirm item count and grouping match what was added.
- Click "Request Quote".
- Verify: success toast, cart emptied in UI, and in DB:
  - one new `data_orders` row (status `pending`, correct `user_id`, `delivery_email`),
  - matching `data_order_items` rows,
  - `data_cart_items` cleared for the user,
  - `user_activity_log` has a `submit_order` entry,
  - `notify-admins` invocation (check edge function logs; note: Meta Pixel/CAPI errors are pre-existing and unrelated).

### Phase 4 — Admin side (UI)
- Go to `/admin/orders`; confirm the new order shows as pending with correct customer, item count, and the summary "Pending" counter incremented.
- Open the order detail; verify customer info, line items, records, and totals render correctly.
- Exercise an admin action (fulfill or cancel) and verify the status updates in DB and the corresponding `notify-admins` call fires.

### Phase 5 — Cleanup
- Delete the test `data_order_items`, `data_orders`, and any leftover `data_cart_items` created during the test (scoped to the rows captured in Phase 1 diff).
- Confirm tables return to baseline. Test-only `user_activity_log` entries left as-is (audit log) unless you want them removed too.

## Reporting
- For each phase: what was tested, expected vs. actual, and pass/fail.
- A precise list of any bugs found (UI, RLS/permission, missing data, broken totals, notification failures). If I find a bug, I'll stop and report it before changing any code.

## Notes / risks
- This creates and then deletes real rows in `data_orders` / `data_order_items` / `data_cart_items`.
- An admin action (fulfill/cancel) triggers `notify-admins`, which may send a real email. I'll confirm you're OK with that, or use a status that minimizes external side effects.
- The logged-in preview user is an admin, which is convenient for testing both sides with one account; the cart/order logic itself is identical for non-admins (RLS scopes by `user_id`).
