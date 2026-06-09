## Goal

Meta gets almost no attributed revenue ($94k spent, 1 attributed donation) because this org's Meta ads use refcodes like `q2fad2`, `q2fad5`, `enbyBS` that contain no keyword the resolver recognizes (`fb`, `meta`, `facebook`). Rather than guessing with regex, we'll do it the **deterministic, self-maintaining** way: read the actual destination link of every Meta ad, extract its `refcode`, and store an exact refcode → Meta mapping. Donations then attribute to Meta with high confidence and link back to the specific campaign/ad.

## How it works

```text
Meta Graph API (ads + creatives)
   └─ destination link: https://secure.actblue.com/donate/xyz?refcode=q2fad2
        └─ parse refcode  -> "q2fad2"
            └─ upsert campaign_attribution (refcode=q2fad2, channel=meta,
                                            campaign_label=<campaign name>, source=meta_ad)
                 └─ recompute_attribution -> donations with refcode q2fad2 become "meta"
```

This mirrors Molitico's deterministic `refcode_mappings`, but reconciles the mapping from the live ad links instead of generating it at ad-creation (which we can't do, since we don't deploy ads from the app).

## Plan

### 1. Capture Meta ad links (new sync step)
- Add `syncMetaAdLinks()` in `supabase/functions/_shared/sync-lib.ts`, called from the Meta branch of the org sync alongside the existing campaign-insights pull.
- Fetch ads + creatives from the Graph API:
  `GET /{ad_account}/ads?fields=id,name,effective_status,campaign{id,name},creative{object_story_spec,asset_feed_spec,url_tags,template_url,link_url,effective_object_story_spec}`
- For each ad, extract every destination URL it can reach:
  - `creative.object_story_spec.link_data.link` / `child_attachments[].link`
  - `creative.asset_feed_spec.link_urls[].website_url`
  - `creative.template_url`, `creative.link_url`, `effective_object_story_spec`
  - `creative.url_tags` (merged query params) as a fallback
- Parse each URL's query string for `refcode` (and `refcode2` if present). Also capture the ActBlue form slug from the path when available.

### 2. Store deterministic mappings
- For each `(refcode, campaign_name)` found, upsert into `campaign_attribution`:
  `channel='meta'`, `match_type='exact'`, `pattern=<refcode>`, `campaign_label=<campaign name>`, `meta_campaign_id=<campaign id>`, `priority` high (e.g. 10 so ad-derived mappings win over manual patterns).
- Add a `source` column (`meta_ad` | `manual`) so auto-synced mappings are distinguishable and can be safely refreshed each sync without clobbering admin-created ones. Upsert on `(organization_id, pattern)`.

### 3. Recompute after sync
- After ad-link sync completes, call `recompute_attribution(org_id)` (already wired for webhook/CSV paths) so historical donations re-attribute immediately.

### 4. Admin visibility
- On `/admin/attribution`, show the auto-synced Meta mappings (read-only badge "from Meta ad") next to manual ones, plus a "Sync Meta ad links" action that triggers the fetch + recompute on demand.

### 5. Backfill & verify
- Run the new sync for this org, then confirm Meta donations jump from ~$3 to a realistic share and spot-check that `q2fad*` refcodes now resolve to `meta` with `attribution_method='mapping'`, `confidence='high'`.

## Technical notes
- **Schema:** add `source text default 'manual'` to `campaign_attribution`; add unique index on `(organization_id, pattern)` for clean upserts. Migration includes it; no new table.
- **Resolver:** no change needed — exact mappings already take priority 1 in `recompute_attribution`. We're just populating them.
- **Token scope:** uses the existing stored Meta access token + ad account (same credentials as `syncMeta`). Ad-creative reads require `ads_read`, which the current insights pull already relies on.
- **Edge case:** ads with no parseable refcode are skipped (logged, not errored). Keyword fallback still covers anything unmapped.
- **Optional follow-up (not in this pass):** broaden the keyword regex to catch `fad`/`fbad` shorthands for orgs without a Meta connection — kept out so we rely on deterministic links here.
