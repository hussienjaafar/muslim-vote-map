## Click an issue to swap it in place

### Goal
Let users replace the issue they're viewing without removing it and adding another. Clicking a selected issue's name opens the issue list and picks a replacement in place.

### Change (single file: `src/components/issue-donor/IssueSelector.tsx`)
For each selected issue row, wrap the issue name (the swatch + name area) in a `DropdownMenu` whose trigger is the name button. Opening it shows the list of **other** issues (the same `remaining` list used by "Add another issue"). Selecting one replaces that issue at its position via `onChange`, preserving order.

Details:
- Add a `swap(oldId, newId)` helper that maps `selectedIds`, replacing `oldId` with `newId` at the same index.
- Track which row's dropdown is open (e.g. `swapOpenId` state) so only one opens at a time.
- Trigger = the swatch + name made into a button with a subtle hover affordance and a small chevron icon to signal it's interactive; keep the Live/Publish/Draft badge and the X remove button unchanged.
- Dropdown content lists `remaining` issues (exclude already-selected), same draft labeling as the existing add menu. Empty state: "No other issues available."
- Keep the existing "Add an issue / Add another issue" button for stacking additional issues — only the swap-in-place behavior is added.

### Verification
- On `/map` with one issue (e.g. Asian), click the issue name → list opens → pick another → map re-renders with the new issue, count stays 1/3.
- Confirm X remove and Publish/Live badges still work, and "Add another issue" still stacks.