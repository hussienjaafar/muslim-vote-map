# Fix Ad Account Selector Overflow + Add Search

## Problem
The "Choose an ad account" dialog in `OrgIntegrations.tsx` renders every account as a button in an unbounded list. With many accounts, the dialog grows past the viewport and becomes unscrollable / unusable.

## Changes

1. **Constrain dialog height**
   - Add `max-h-[85vh]` and `flex flex-col` to `DialogContent` so the dialog never exceeds the viewport.
   - Keep the header + description fixed at the top.
   - Wrap the account list in a scrollable container (`overflow-y-auto flex-1`).

2. **Add a search bar**
   - Insert a text input (using existing `Input` component) between the description and the account list.
   - Filter accounts by name or account ID as the user types.
   - Show a "No results" message when filtering yields zero matches.

## Files changed
- `src/components/org/OrgIntegrations.tsx` only (lines ~250–278)

No backend or logic changes — purely UI/UX.