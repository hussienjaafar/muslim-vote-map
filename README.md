# Campaign Data Solutions

uild a full-screen Muslim Voter Impact Map application. This is a data visualization tool showing Muslim voter population data across US states and congressional districts on an interactive map.

## Database Tables

Create these tables:

### voter_impact_states
- id (uuid, primary key)
- state_code (text, unique, not null) — e.g. "MI", "CA"
- state_name (text, not null)
- muslim_voters (integer, not null, default 0)
- households (integer, default 0)
- cell_phones (integer, default 0)
- registered (integer, default 0)
- registered_pct (numeric, default 0)
- vote_2024 (integer, default 0)
- vote_2024_pct (numeric, default 0)
- vote_2022 (integer, default 0)
- vote_2022_pct (numeric, default 0)
- political_donors (integer, default 0)
- political_activists (integer, default 0)

### voter_impact_districts
- id (uuid, primary key)
- cd_code (text, unique, not null) — e.g. "MI-11"
- state_code (text, not null)
- district_num (integer, not null)
- winner (text), winner_party (text), winner_votes (integer)
- runner_up (text), runner_up_party (text), runner_up_votes (integer)
- margin_votes (integer), margin_pct (numeric), total_votes (integer)
- muslim_voters (integer, not null, default 0)
- muslim_registered (integer, default 0), muslim_unregistered (integer, default 0)
- voted_2024 (integer, default 0), didnt_vote_2024 (integer, default 0)
- turnout_pct (numeric, default 0)
- can_impact (boolean, default false)
- votes_needed (integer), cost_estimate (numeric)
- cell_phones (integer, default 0), households (integer, default 0)

### data_products
- id (uuid, primary key)
- name (text, not null)
- description (text)
- price_cents (integer, not null)
- product_type (text, not null)
- active (boolean, default true)

### data_cart_items
- id (uuid, primary key)
- user_id (uuid, references auth.users, not null)
- product_id (uuid, references data_products, not null)
- geo_type (text, not null) — "state" or "district"
- geo_code (text, not null)
- geo_label (text)
- quantity (integer, default 1)
- created_at (timestamptz, default now())
- unique constraint on (user_id, product_id, geo_type, geo_code)

Enable RLS on all tables. States and districts should be readable by everyone (public SELECT). Cart items should be user-scoped (SELECT/INSERT/UPDATE/DELETE where user_id = auth.uid()).

## Tech Stack
- React + TypeScript + Vite + Tailwind CSS
- maplibre-gl + react-map-gl for the map
- @turf/turf for geo calculations
- recharts for any charts
- zustand for state management
- shadcn/ui components
- @tanstack/react-query for data fetching

## Map Features

### Interactive Choropleth Map
- Full-screen map using MapLibre GL with a dark base style
- Load US state boundaries from a TopoJSON/GeoJSON source
- Color states based on selected metric using these color stops (dark-to-bright gradient):
  - Population: 0→#0a0a1a, 500→#0d2847, 2K→#0f4c75, 5K→#1277a8, 10K→#15a2c2, 25K→#22c7a0, 50K→#4ae08a, 100K→#8ef06e, 200K→#c8f74d, 500K→#f9f535
  - Donors: similar scale 0-86K
  - Activists: similar scale 0-3K
  - Turnout: 0%-75% percentage scale

### 4 Metric Toggles (top of map)
- Muslim Voters (population count)
- Political Donors (count)
- Political Activists (count)
- 2024 Turnout (percentage)

### Map Controls
- Recenter button to snap back to mainland US view (center: -98.58, 39.83, zoom: 4)
- Minimum zoom of 3.5
- renderWorldCopies={false}
- maxBounds constrained to North America

### State/District Selection
- Click a state to select it and show details in sidebar
- When zoomed into a state, show congressional district boundaries
- Click a district to see district-level details

## Sidebar (RegionSidebar)
When a state or district is selected, show a right sidebar with:

### For States:
- State name, muslim voter count
- Registration rate, 2024 turnout, 2022 turnout
- Political donors and activists counts
- Households and cell phones counts

### For Districts:
- District code (e.g. MI-11)
- Election results: winner, runner-up, margin
- Muslim voter breakdown: registered vs unregistered, voted vs didn't vote
- Impact assessment: can_impact flag, votes_needed, cost_estimate
- Impact score calculated as: if can_impact is false → 0; otherwise ratio of mobilizable voters (didnt_vote_2024) to margin_votes

### Comparison Feature
- "Add to Compare" button to add current region to comparison tray
- Compare up to 4 regions side by side
- Show key metrics for each compared region

### Data Purchase CTA
- "Get This Data" button opens a DataProductSelector drawer
- Users can select data products for the selected region
- Products go into a cart (DataCart) accessible from map header
- Cart icon in header shows item count badge

## Map Legend
- Horizontal gradient bar at bottom of map
- Shows color scale for current metric
- Labels at each color stop threshold

## Data Import (Admin)
- Admin-only component for importing voter data from Excel (.xlsx) files
- Separate import flows for states and districts data
- Validates columns match expected schema before importing
- Upserts data (updates existing, inserts new)

## Authentication
- Include login/signup with email
- Admin role check for data import functionality
- Cart features require authentication

## Key Behaviors
- Map should be full-screen with overlay UI (header, sidebar, legend)
- Dark theme throughout (#0a0a1a background, blue/green/cyan accents)
- Responsive — sidebar collapses on mobile
- Data queries use 10-minute stale time (data doesn't change often)

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://muslim-vote-map.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/fb04d649-fdb9-4f1f-a004-8f24f44533b2).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `claude/thirsty-bouman` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
