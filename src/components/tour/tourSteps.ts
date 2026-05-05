export interface TourStep {
  id: string;
  /** CSS selector for the target element; null = center modal */
  target: string | null;
  title: string;
  description: string;
  /** Preferred tooltip position relative to target */
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export const HOME_TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    target: null,
    title: 'Welcome to Campaign Data Solutions',
    description:
      "Let's take a quick tour so you can start finding the strongest districts for the issues you campaign on.",
  },
  {
    id: 'account-menu',
    target: '[data-tour="account-menu"]',
    title: 'Your Account',
    description:
      'Access your profile, requests, saved regions, and settings from this menu.',
    position: 'bottom',
  },
  {
    id: 'mini-map',
    target: '[data-tour="mini-map"]',
    title: 'National Issue Map',
    description:
      'Click any state to open the full Issue Map with district-level donor and activist data.',
    position: 'bottom',
  },
  {
    id: 'national-stats',
    target: '[data-tour="national-stats"]',
    title: 'National Snapshot',
    description:
      'A high-level view of issue-based donor coverage across all 435 congressional districts.',
    position: 'bottom',
  },
  {
    id: 'data-products',
    target: '[data-tour="data-products"]',
    title: 'Available Audiences',
    description:
      'Browse audiences — issue donor lists, cell phones, addresses. Select regions on the map to add them to a quote request.',
    position: 'top',
  },
];

export const MAP_TOUR_STEPS: TourStep[] = [
  {
    id: 'map-welcome',
    target: null,
    title: 'The Issue Map',
    description:
      'Your main tool for exploring issue-based donor and activist data across every state and congressional district.',
  },
  {
    id: 'metric-controls',
    target: '[data-tour="metric-controls"]',
    title: 'Switch Metrics',
    description:
      'Toggle between donor tiers, cell phones, and addresses to see different data layers for the selected issue.',
    position: 'bottom',
  },
  {
    id: 'map-canvas',
    target: '[data-tour="map-canvas"]',
    title: 'Explore States & Districts',
    description:
      'Click any state to drill in. Zoom to reveal individual congressional districts with detailed counts.',
    position: 'top',
  },
  {
    id: 'region-search',
    target: '[data-tour="region-search"]',
    title: 'Search Regions',
    description:
      'Quickly find any state or district by name or code.',
    position: 'bottom',
  },
  {
    id: 'cart-icon',
    target: '[data-tour="cart-icon"]',
    title: 'Your Quote Request',
    description:
      'As you add audiences from the sidebar, they appear here. Review your selections and submit a quote request when ready.',
    position: 'bottom',
  },
];

export const TOTAL_STEPS = HOME_TOUR_STEPS.length + MAP_TOUR_STEPS.length;
