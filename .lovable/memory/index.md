# Memory: index.md
Updated: now

Muslim Voter Data Platform — architecture decisions, product catalog, and design constraints

## Domain
- Production: muslimvoterproject.com
- Email sender: notify.muslimvoterproject.com
- Email logo: https://muslimvoterproject.com/logo-icon.png

## Product Catalog (5 products)
- Voters: $0.10/record, source_field: muslim_voters
- Activists: $0.20/record, source_field: political_activists  
- Donor Platinum: $10.00/record, source_field: donor_platinum
- Donor Gold: $5.00/record, source_field: donor_gold
- Donor Silver: $1.00/record, source_field: donor_silver

## Key Decisions
- Invite-only signup (whitelist in `invited_emails` table)
- Teaser data free, detailed data gated behind purchase
- Manual fulfillment initially, automated later
- Saved regions (bookmarks) + saved lists (cart configs)
- Stripe for checkout
- Admin notified via email + dashboard on new orders

## Routes
- / → Landing page (public)
- /login → Auth (public)
- /map → Voter Impact Map (auth-gated)
- /account → User dashboard
- /admin → Admin back-office

## Design
- Dark theme, polish existing design
- Logo: geometric crescent+star icon (teal #0ea5c9 on dark), public/logo-icon.png (512x512), public/logo.png (full wordmark 2400x1000)
- Brand name: "Muslim Voter Project" (NOT "Muslim Voter Impact")
