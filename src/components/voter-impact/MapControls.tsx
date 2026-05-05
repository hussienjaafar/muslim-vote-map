import React from 'react';
import type { MetricType } from '@/store/mapStore';

interface MapControlsProps {
  activeMetric: MetricType;
  onMetricChange: (metric: MetricType) => void;
  hiddenMetrics?: MetricType[];
  variant?: 'default' | 'mobile-bar';
}

const METRICS: { key: MetricType; label: string; shortLabel: string; activeColor: string }[] = [
  { key: 'population', label: 'Population', shortLabel: 'Pop', activeColor: 'bg-blue-600' },
  { key: 'donors', label: 'Donors', shortLabel: 'Don', activeColor: 'bg-emerald-600' },
  { key: 'activists', label: 'Activists', shortLabel: 'Act', activeColor: 'bg-violet-600' },
  { key: 'turnout', label: 'Turnout %', shortLabel: 'Turn', activeColor: 'bg-amber-600' },
  { key: 'impact', label: 'Impact', shortLabel: 'Imp', activeColor: 'bg-rose-600' },
];

export function MapControls({ activeMetric, onMetricChange, hiddenMetrics, variant = 'default' }: MapControlsProps) {
  const visibleMetrics = hiddenMetrics
    ? METRICS.filter(m => !hiddenMetrics.includes(m.key))
    : METRICS;

  const isMobileBar = variant === 'mobile-bar';

  return (
    <div
      className={
        isMobileBar
          ? 'flex gap-1 bg-[#1c1c1e]/90 backdrop-blur-[20px] rounded-xl border border-[rgba(255,255,255,0.08)] p-1 overflow-x-auto snap-x snap-mandatory shadow-lg w-full'
          : 'flex gap-1 bg-[#1c1c1e]/80 backdrop-blur-[20px] rounded-lg border border-[rgba(255,255,255,0.08)] p-1 overflow-x-auto max-w-[calc(100vw-5rem)]'
      }
    >
      {visibleMetrics.map(({ key, label, shortLabel, activeColor }) => (
        <button
          key={key}
          onClick={() => onMetricChange(key)}
          className={`px-3 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium rounded-md transition-colors whitespace-nowrap snap-start min-h-[40px] sm:min-h-0 flex-1 sm:flex-none ${
            activeMetric === key
              ? `${activeColor} text-white`
              : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
          }`}
          aria-pressed={activeMetric === key}
        >
          <span className={isMobileBar ? 'font-display' : 'hidden sm:inline font-display'}>{isMobileBar ? shortLabel : label}</span>
          {!isMobileBar && <span className="sm:hidden font-display">{shortLabel}</span>}
        </button>
      ))}
    </div>
  );
}
