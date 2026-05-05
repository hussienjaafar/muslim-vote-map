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
    title: 'Welcome to Muslim Voter Project',
    description:
      "Let's take a quick tour of the platform so you can start exploring voter impact data right away.",
  },
  {
    id: 'account-menu',
    target: '[data-tour="account-menu"]',
    title: 'Your Account',
    description:
      'Access your profile, orders, saved regions, and settings from this menu.',
    position: 'bottom',
  },
  {
    id: 'mini-map',
    target: '[data-tour="mini-map"]',
    title: 'Interactive US Map',
    description:
      'Click any state on this map to jump straight to the full interactive map with detailed voter data.',
    position: 'bottom',
  },
  {
    id: 'national-stats',
    target: '[data-tour="national-stats"]',
    title: 'National Snapshot',
    description:
      'These cards show a high-level overview of nationwide Muslim voter data — population, registration rate, and turnout.',
    position: 'bottom',
  },
  {
    id: 'data-products',
    target: '[data-tour="data-products"]',
    title: 'Data Products',
    description:
      'Browse available data products — voter lists, donor files, cell phones, and more. Select regions on the map to add them to your cart.',
    position: 'top',
  },
];

export const MAP_TOUR_STEPS: TourStep[] = [
  {
    id: 'map-welcome',
    target: null,
    title: 'The Interactive Voter Impact Map',
    description:
      'This is your main tool for exploring Muslim voter data across every state and congressional district.',
  },
  {
    id: 'metric-controls',
    target: '[data-tour="metric-controls"]',
    title: 'Switch Metrics',
    description:
      'Toggle between Population, Turnout, Donors, Activists, and Impact views to see different data layers on the map.',
    position: 'bottom',
  },
  {
    id: 'map-canvas',
    target: '[data-tour="map-canvas"]',
    title: 'Explore States & Districts',
    description:
      'Click any state to see its data. Zoom in to reveal individual congressional districts with detailed metrics.',
    position: 'top',
  },
  {
    id: 'region-search',
    target: '[data-tour="region-search"]',
    title: 'Search Regions',
    description:
      'Quickly find any state or district by name or code using the search tool.',
    position: 'bottom',
  },
  {
    id: 'cart-icon',
    target: '[data-tour="cart-icon"]',
    title: 'Your Data Cart',
    description:
      'As you add data products from the sidebar, they appear here. Review your selections and submit a quote request when ready.',
    position: 'bottom',
  },
];

export const TOTAL_STEPS = HOME_TOUR_STEPS.length + MAP_TOUR_STEPS.length;
