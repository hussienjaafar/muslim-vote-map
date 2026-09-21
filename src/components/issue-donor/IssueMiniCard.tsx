import React from 'react';

interface IssueMiniCardProps {
  stateCode: 'AK' | 'HI';
  color: string;
  value: string;
  onClick: () => void;
}

const AK_PATH = 'M2 38 L8 28 L18 22 L28 18 L38 16 L48 18 L58 22 L68 20 L78 24 L88 30 L98 38 L88 46 L78 50 L68 48 L58 44 L48 42 L38 44 L28 50 L18 54 L8 50 Z';
const HI_PATH = 'M62 8 L72 4 L78 10 L74 16 L64 14 Z M50 20 L58 16 L66 22 L60 28 L50 26 Z M38 30 L48 26 L54 32 L48 38 L38 36 Z M24 38 L34 34 L42 40 L38 48 L28 46 Z M10 50 L20 44 L30 50 L26 58 L14 56 Z';

export function IssueMiniCard({ stateCode, color, value, onClick }: IssueMiniCardProps) {
  const isAK = stateCode === 'AK';
  const viewBox = isAK ? '0 0 100 80' : '0 0 100 70';
  const path = isAK ? AK_PATH : HI_PATH;

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#1c1c1e]/85 backdrop-blur-[20px] px-2 py-1.5 hover:bg-[#2c2c2e] transition-colors cursor-pointer"
      aria-label={`View ${stateCode}`}
    >
      <svg viewBox={viewBox} className="w-6 h-4 shrink-0">
        <path d={path} fill={color} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      </svg>
      <span className="text-[10px] font-bold text-foreground font-display">{stateCode}</span>
      <span className="text-[10px] text-muted-foreground tabular-nums">{value}</span>
    </button>
  );
}
