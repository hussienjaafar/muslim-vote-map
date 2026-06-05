## Fix: Soften the district panel overlay on desktop

### Problem
When a district is selected on the Issue Map (desktop), the shared `SheetContent` component renders a full-screen `bg-black/80` overlay. This makes the rest of the map very dark and hard to read.

### Solution
Add an optional `overlayClassName` prop to the shared `SheetContent` component, then pass a lighter overlay class (`bg-black/20`) from the `IssueRegionSidebar` desktop usage so the map stays readable while the panel is open.

### Scope
- Desktop only. Mobile already uses a custom persistent bottom sheet with no overlay.
- Only the region detail panel. Other Sheets (issue picker, cart drawer) keep their existing dark overlay.

### Changes
1. **src/components/ui/sheet.tsx**
   - Accept optional `overlayClassName?: string` on `SheetContentProps`
   - Forward it to `<SheetOverlay className={cn(...)}>` so callers can override the overlay style

2. **src/components/issue-donor/IssueRegionSidebar.tsx**
   - On desktop (`!bareContent`), pass `overlayClassName="bg-black/20"` to `SheetContent`

### Verification
- Re-run the same district selection flow (e.g., CA-013) on desktop and confirm the map is no longer dark behind the panel.
- Confirm the overlay still exists and clicking outside the panel still closes it.
- Confirm other Sheet uses (mobile issue picker, cart drawer) are unaffected.

### No changes needed
- Mobile layout, mobile sheet, or any backend / data logic.