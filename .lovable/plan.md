## Goal
Make "Connect with Facebook" open Facebook auth in a **popup window** that returns to the org page automatically, instead of the current full-page redirect.

## Why it doesn't work today
- `handleConnectMeta` does `window.location.href = authorizeUrl` — a full-page redirect, never a popup.
- It also stores the org id in `sessionStorage` (`meta_oauth_org`) and the callback page reads it back. `sessionStorage` is per-window and is **not shared** with a popup, so a popup-based flow can't rely on it.

## Plan

### 1. Open a popup in `OrgIntegrations.tsx`
- Replace the redirect with `window.open(authorizeUrl, 'meta-oauth', 'width=600,height=750,...')` centered on screen.
- Keep the org id in the opener's React state (no sessionStorage needed since the opener stays open).
- Listen for a `message` event from the popup containing `{ type: 'meta-oauth', code, state }` (validate `event.origin === window.location.origin`).
- On receipt: close the popup, then run the existing `useMetaOAuthCallback` mutation to exchange the code and fetch ad accounts.
- If the popup is blocked (`window.open` returns null) or closed before completing, show a toast telling the user to allow popups / try again.

### 2. Show ad-account selection in a dialog (in the opener)
- Add a `Dialog` to `OrgIntegrations.tsx` that appears once ad accounts are returned, reusing the same selection UI currently in `MetaOAuthCallback.tsx` (calls `useMetaSaveConnection`).
- On save: close dialog, toast success, and the credential status query already invalidates to flip the badge to **Connected**.

### 3. Turn the callback route into a popup relay
- In `MetaOAuthCallback.tsx`, when `window.opener` exists, `postMessage({ type: 'meta-oauth', code, state, error })` to `window.opener` (target origin = `window.location.origin`) and `window.close()` — showing only a brief "Completing connection… you can close this window" message.
- Keep the existing full-page behavior as a fallback for when there is no opener (e.g. popup was blocked and Facebook redirected the main tab).

### 4. Redirect URI unchanged
- The redirect URI stays `${window.location.origin}/meta-oauth-callback`, which is already registered in Meta for preview, published, and custom domain. No backend/edge-function changes are required.

## Technical notes
- Files touched: `src/components/org/OrgIntegrations.tsx`, `src/pages/MetaOAuthCallback.tsx`. Possibly a small shared selection component to avoid duplicating the account-picker UI.
- No edge function, schema, or redirect-URI changes.
- Origin check on the `message` listener prevents cross-origin spoofing.
- Note: if Meta is still in Development mode or scopes need App Review, non-app-role Facebook users may not be able to complete the grant — that's a Meta-side setting, separate from this popup change.