## Goal

Let admins upload a new issue directly from the new **Issues** tab on the Data Management page, so import and management live in one place.

## What I'll build

1. **Embed the uploader in the Issues tab** — Add the existing `IssueDonorImport` component at the top of `IssueDataManager.tsx`, above the issues table. It already handles the full XLSX flow (file pick → sheet preview → confirm → upsert issues/districts/states). No new parsing logic needed.

2. **Auto-refresh after import** — Currently `IssueDonorImport` doesn't refresh the issue list/counts. I'll add React Query invalidation on successful import for `['issues']` and `['issue-donor-counts']` so a newly uploaded issue (and its donor-record count) appears immediately in the table below without a page reload.

### Layout
```text
Issues tab
├── Upload panel (IssueDonorImport)   ← new here
└── Issues table (rename / order / publish / delete)
```

## Notes
- The Import tab still keeps its uploader (Election Results + Issue Donor) — this is additive, not a move. If you'd prefer I remove the duplicate Issue Donor uploader from the Import tab, tell me and I'll drop it.
- No backend or schema changes; uses the existing `issues` / `issue_donor_districts` / `issue_donor_states` tables and RLS already in place.
- Styling reuses existing surgical-glass tokens.
