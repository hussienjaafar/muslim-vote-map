import React from 'react';
import type { MetricType } from '@/store/mapStore';
import { colorScales, impactCountScale, metricLabels, type ColorStop } from '@/lib/colorScales';
import { AlertTriangle } from 'lucide-react';

interface MapLegendProps {
  activeMetric: MetricType;
  localColorStops?: ColorStop[] | null;
  isDistrictView?: boolean;
  hasDistrictField?: boolean;
  compact?: boolean;
}

export function VoterImpactMapLegend({
  activeMetric,
  localColorStops,
  isDistrictView,
  hasDistrictField,
  compact,
}: MapLegendProps) {
  // Use impact count scale for state-level impact view
  const stops = localColorStops || (activeMetric === 'impact' && !isDistrictView ? impactCountScale : colorScales[activeMetric]);
  const showLocalLabel = isDistrictView && !!localColorStops;
  const showWarning = isDistrictView && !hasDistrictField;

  const gradientColors = stops.map((s, i) => {
    const pct = stops.length > 1 ? (i / (stops.length - 1)) * 100 : 0;
    return `${s.color} ${pct}%`;
  }).join(', ');

  const startLabel = stops[0]?.label || String(stops[0]?.value || 0);
  const midIdx = Math.floor(stops.length / 2);
  const midLabel = stops[midIdx]?.label || String(stops[midIdx]?.value || 0);
  const endLabel = stops[stops.length - 1]?.label || String(stops[stops.length - 1]?.value || 0);

  const title = activeMetric === 'impact'
    ? (isDistrictView ? 'IMPACT SCORE (DISTRICTS)' : 'IMPACT DISTRICTS PER STATE')
    : `${metricLabels[activeMetric].toUpperCase()} (${isDistrictView ? 'DISTRICTS' : 'STATES'})`;

  if (compact) {
    return (
      <div className="bg-[#1c1c1e]/85 backdrop-blur-[20px] rounded-lg border border-[rgba(255,255,255,0.08)] px-2.5 py-1.5 min-w-[160px] max-w-[220px]">
        <div className="flex items-center gap-1.5 mb-1">
          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: stops[Math.floor(stops.length / 2)]?.color || '#15a2c2' }} />
          <span className="text-[8px] font-semibold uppercase tracking-wider text-muted-foreground truncate font-display">{title}</span>
        </div>
        <div
          className="h-1.5 rounded-full w-full mb-0.5"
          style={{ background: `linear-gradient(to right, ${gradientColors})` }}
        />
        <div className="flex justify-between text-[8px] text-muted-foreground">
          <span>{startLabel}</span>
          <span>{endLabel}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#1c1c1e]/80 backdrop-blur-[20px] rounded-lg border border-[rgba(255,255,255,0.08)] p-2 sm:p-3 min-w-[140px] sm:min-w-[200px] max-w-[200px] sm:max-w-none">
      {/* Title with indicator dot */}
      <div className="flex items-center gap-1.5 mb-1.5 sm:mb-2">
        <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0" style={{ background: stops[Math.floor(stops.length / 2)]?.color || '#15a2c2' }} />
        <span className="text-[8px] sm:text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate font-display">{title}</span>
      </div>

      {showWarning && (
        <div className="flex items-center gap-1 sm:gap-1.5 text-yellow-400 text-[10px] sm:text-xs mb-1.5 sm:mb-2">
          <AlertTriangle className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
          <span>Not available at district level</span>
        </div>
      )}
      {activeMetric === 'impact' && !isDistrictView && (
        <div className="flex items-center gap-1 sm:gap-1.5 text-muted-foreground text-[10px] sm:text-xs mb-1.5 sm:mb-2 italic">
          Zoom in to see district-level scores
        </div>
      )}
      <div
        className="h-2 sm:h-3 rounded-full w-full mb-1 sm:mb-1.5"
        style={{ background: `linear-gradient(to right, ${gradientColors})` }}
      />
      <div className="flex justify-between text-[8px] sm:text-[10px] text-muted-foreground">
        <span>{startLabel}</span>
        <span className="hidden sm:inline">{midLabel}</span>
        <span>{endLabel}</span>
      </div>
      {showLocalLabel && (
        <div className="text-[8px] sm:text-[10px] text-muted-foreground mt-1 text-center italic">
          (relative to state)
        </div>
      )}
    </div>
  );
}
