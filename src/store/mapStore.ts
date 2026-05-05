import { create } from 'zustand';

export type MetricType = 'population' | 'donors' | 'activists' | 'turnout' | 'impact';

interface CompareItem {
  type: 'state' | 'district';
  code: string;
  label: string;
}

interface MapState {
  selectedMetric: MetricType;
  setSelectedMetric: (metric: MetricType) => void;
  
  selectedState: string | null;
  setSelectedState: (state: string | null) => void;
  
  selectedDistrict: string | null;
  setSelectedDistrict: (district: string | null) => void;
  
  compareItems: CompareItem[];
  addCompareItem: (item: CompareItem) => void;
  removeCompareItem: (code: string) => void;
  clearCompare: () => void;
  
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  
  isDistrictView: boolean;
  setIsDistrictView: (show: boolean) => void;
}

export const useMapStore = create<MapState>((set) => ({
  selectedMetric: 'population',
  setSelectedMetric: (metric) => set({ selectedMetric: metric }),
  
  selectedState: null,
  setSelectedState: (state) => set({ selectedState: state, selectedDistrict: null, sidebarOpen: !!state }),
  
  selectedDistrict: null,
  setSelectedDistrict: (district) => set({ selectedDistrict: district, sidebarOpen: !!district }),
  
  compareItems: [],
  addCompareItem: (item) => set((s) => {
    if (s.compareItems.length >= 4 || s.compareItems.some(c => c.code === item.code)) return s;
    return { compareItems: [...s.compareItems, item] };
  }),
  removeCompareItem: (code) => set((s) => ({
    compareItems: s.compareItems.filter(c => c.code !== code)
  })),
  clearCompare: () => set({ compareItems: [] }),
  
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  
  cartOpen: false,
  setCartOpen: (open) => set({ cartOpen: open }),
  
  isDistrictView: false,
  setIsDistrictView: (show) => set({ isDistrictView: show }),
}));
