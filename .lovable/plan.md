# Resolve per-broadcast refcode via vanity-link redirects

## Idea
For each Switchboard broadcast, read the vanity URL in its message body, follow that URL's redirect to the final ActBlue page, pull `?refcode=` from the resolved URL, and store it on the broadcast as the authoritative refcode.

## Critical unknown to resolve first
The 4 most recent broadcasts all used the **same** vanity URL (`hamawyfornj.org/donate`), which today redirects to `...?refcode=victory`. We must find out whether each broadcast really has its **own** vanity path or whether one link is repointed per send — because HTTP redirects keep no history:
- **Unique path per broadcast** → following each redirect yields the correct refcode for every broadcast, including historical ones. The feature works fully.
- **One shared, repointed link** → following it today returns only the current target (`victory`) for all broadcasts; historical sends are not recoverable, and we must NOT overwrite them with the live value.

## Step 1 — Diagnostic (run a full sync, inspect, no data changes to attribution)
Temporarily, in `syncSwitchboard`, for every broadcast:
- Extract all URLs from `message_text`.
- For each, follow the redirect chain server-side (`fetch(url, { redirect: 'manual' })` looping on `Location`, capped at ~5 hops, short timeout).
- Log: broadcast id, name, date, vanity URL(s), final resolved URL, extracted refcode.

Review the logs to confirm whether vanity paths are unique per broadcast and whether resolved refcodes line up with each broadcast's name/date.

## Step 2 — Implement extraction based on findings
In `syncSwitchboard`, populate `sms_campaign_metrics.link_refcode`:
1. First try a direct `?refcode=` already present in `message_text` (already implemented).
2. Else, extract the vanity URL from `message_text` and follow its redirect chain to the final ActBlue URL, then read `refcode` from it.
3. **Uniqueness guard (only if Step 1 shows a shared link):** if one vanity URL is used by more than one broadcast, treat the live-resolved refcode as ambiguous — apply it only to the single most-recent broadcast using that URL (its redirect target reflects the latest send) and leave the rest to the existing date-based fallback. If links are unique per broadcast, no guard is needed and all broadcasts get their resolved refcode.

Redirect-following safety: only follow `https`, cap redirects, add an AbortController timeout, and ignore non-ActBlue final URLs.

## Step 3 — Assignment + backfill
- `assign_sms_refcodes` already prefers `link_refcode` over the date heuristic (done previously); no change needed.
- Run a full org re-sync to backfill `link_refcode`, then attribution recomputes automatically and the SMS ROI/detail widgets reflect the corrected per-broadcast refcodes.

## Honest outcome
- If your broadcasts use unique vanity paths, this gives clean, exact per-broadcast attribution for past and future sends.
- If they share one repointed link, this reliably fixes **future** sends (resolve right after each send) and the latest send, but cannot reconstruct historical broadcasts from the link — those keep using the date-based fallback. In that case the durable fix is a unique vanity path (or direct ActBlue link with a unique `?refcode=`) per broadcast.

## Technical notes
- File: `supabase/functions/_shared/sync-lib.ts` (`syncSwitchboard`) — add a `resolveRedirect()` helper and the per-broadcast resolution loop; reuse the existing `extractRefcode` / `extractRefcodeFromText` helpers.
- No schema change required (`link_refcode` already exists).
- Diagnostic logging is removed after Step 1.
