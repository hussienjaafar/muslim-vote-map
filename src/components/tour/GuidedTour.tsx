import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import type { TourStep } from './tourSteps';
import { TOTAL_STEPS } from './tourSteps';

interface GuidedTourProps {
  steps: TourStep[];
  /** Global step offset (e.g. 0 for home, 5 for map phase) */
  stepOffset?: number;
  onComplete: () => void;
  onSkip: () => void;
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

type ResolvedPosition = 'top' | 'bottom' | 'left' | 'right';

interface TooltipResult {
  top: number;
  left: number;
  /** The actual side the tooltip ended up on (for arrow placement) */
  resolvedPosition: ResolvedPosition | null;
  /** Horizontal center of the target relative to tooltip left */
  arrowOffset: number;
}

function getTooltipPosition(
  rect: TargetRect | null,
  position: TourStep['position'],
  tooltipW: number,
  tooltipH: number,
): TooltipResult {
  if (!rect) {
    return {
      top: Math.max(60, (window.innerHeight - tooltipH) / 2),
      left: Math.max(16, (window.innerWidth - tooltipW) / 2),
      resolvedPosition: null,
      arrowOffset: tooltipW / 2,
    };
  }

  const pad = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const resolved: ResolvedPosition = position ?? 'bottom';

  let top = 0;
  let left = 0;

  switch (resolved) {
    case 'bottom':
      top = rect.bottom + pad;
      left = rect.left + rect.width / 2 - tooltipW / 2;
      break;
    case 'top':
      top = rect.top - tooltipH - pad;
      left = rect.left + rect.width / 2 - tooltipW / 2;
      break;
    case 'left':
      top = rect.top + rect.height / 2 - tooltipH / 2;
      left = rect.left - tooltipW - pad;
      break;
    case 'right':
      top = rect.top + rect.height / 2 - tooltipH / 2;
      left = rect.right + pad;
      break;
  }

  // Clamp to viewport
  const unclamped = { top, left };
  if (left < 12) left = 12;
  if (left + tooltipW > vw - 12) left = vw - tooltipW - 12;
  if (top < 12) top = 12;
  if (top + tooltipH > vh - 12) top = vh - tooltipH - 12;

  const isMobile = vw < 640;
  if (isMobile) {
    top = Math.min(top, vh - tooltipH - 24);
  }

  // Compute arrow offset — where the target center falls relative to the tooltip
  const targetCenterX = rect.left + rect.width / 2;
  const targetCenterY = rect.top + rect.height / 2;
  let arrowOffset: number;
  if (resolved === 'top' || resolved === 'bottom') {
    arrowOffset = Math.max(16, Math.min(tooltipW - 16, targetCenterX - left));
  } else {
    arrowOffset = Math.max(16, Math.min(tooltipH - 16, targetCenterY - top));
  }

  return { top, left, resolvedPosition: resolved, arrowOffset };
}

/** Renders a small CSS triangle arrow on the edge of the tooltip pointing toward the target */
function TourArrow({ position, offset }: { position: ResolvedPosition; offset: number }) {
  const size = 8;
  const shared = 'absolute w-0 h-0 pointer-events-none';
  const borderColor = 'rgba(32,31,31,0.7)';

  switch (position) {
    case 'bottom':
      return (
        <div className={shared} style={{
          top: -size, left: offset - size,
          borderLeft: `${size}px solid transparent`,
          borderRight: `${size}px solid transparent`,
          borderBottom: `${size}px solid ${borderColor}`,
        }} />
      );
    case 'top':
      return (
        <div className={shared} style={{
          bottom: -size, left: offset - size,
          borderLeft: `${size}px solid transparent`,
          borderRight: `${size}px solid transparent`,
          borderTop: `${size}px solid ${borderColor}`,
        }} />
      );
    case 'right':
      return (
        <div className={shared} style={{
          left: -size, top: offset - size,
          borderTop: `${size}px solid transparent`,
          borderBottom: `${size}px solid transparent`,
          borderRight: `${size}px solid ${borderColor}`,
        }} />
      );
    case 'left':
      return (
        <div className={shared} style={{
          right: -size, top: offset - size,
          borderTop: `${size}px solid transparent`,
          borderBottom: `${size}px solid transparent`,
          borderLeft: `${size}px solid ${borderColor}`,
        }} />
      );
  }
}

export function GuidedTour({ steps, stepOffset = 0, onComplete, onSkip }: GuidedTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipResult>({ top: 0, left: 0, resolvedPosition: null, arrowOffset: 160 });
  const [isTransitioning, setIsTransitioning] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const step = steps[currentStep];
  const globalStep = stepOffset + currentStep + 1;

  const measureTarget = useCallback(() => {
    if (!step?.target) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(step.target);
    if (el) {
      const r = el.getBoundingClientRect();
      setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height, right: r.right, bottom: r.bottom });
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      setTargetRect(null);
    }
  }, [step]);

  // Measure on step change and window resize
  useEffect(() => {
    const timer = setTimeout(measureTarget, 300);
    window.addEventListener('resize', measureTarget);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', measureTarget);
    };
  }, [measureTarget, currentStep]);

  // Position tooltip after target is measured
  useEffect(() => {
    const tw = tooltipRef.current?.offsetWidth ?? 340;
    const th = tooltipRef.current?.offsetHeight ?? 200;
    setTooltipPos(getTooltipPosition(targetRect, step?.position, tw, th));
  }, [targetRect, step]);

  const changeStep = (next: number) => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentStep(next);
      setIsTransitioning(false);
    }, 150);
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      changeStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) changeStep(currentStep - 1);
  };

  if (!step) return null;

  const pad = 8;
  const clipPath = targetRect
    ? `polygon(
        0% 0%, 0% 100%,
        ${targetRect.left - pad}px 100%,
        ${targetRect.left - pad}px ${targetRect.top - pad}px,
        ${targetRect.right + pad}px ${targetRect.top - pad}px,
        ${targetRect.right + pad}px ${targetRect.bottom + pad}px,
        ${targetRect.left - pad}px ${targetRect.bottom + pad}px,
        ${targetRect.left - pad}px 100%,
        100% 100%, 100% 0%
      )`
    : undefined;

  return (
    <div className="fixed inset-0 z-[100]" aria-modal="true" role="dialog">
      {/* Overlay with smooth clipPath transition */}
      <div
        className="absolute inset-0 bg-black/70 transition-[clip-path] duration-300 ease-out"
        style={{ clipPath }}
        onClick={onSkip}
      />

      {/* Pulsing glow ring around target */}
      {targetRect && (
        <div
          className="absolute pointer-events-none rounded-lg animate-tour-pulse"
          style={{
            top: targetRect.top - pad,
            left: targetRect.left - pad,
            width: targetRect.width + pad * 2,
            height: targetRect.height + pad * 2,
            transition: 'top 0.3s ease-out, left 0.3s ease-out, width 0.3s ease-out, height 0.3s ease-out',
          }}
        />
      )}

      {/* Tooltip with entrance animation per step */}
      {!isTransitioning && (
        <div
          key={currentStep}
          ref={tooltipRef}
          className="absolute z-[101] w-[320px] max-w-[calc(100vw-24px)] surgical-glass border border-[rgba(255,255,255,0.08)] p-5 rounded-lg animate-tour-scale-in"
          style={{ top: tooltipPos.top, left: tooltipPos.left }}
        >
          {/* Directional arrow pointing toward the target */}
          {targetRect && tooltipPos.resolvedPosition && (
            <TourArrow position={tooltipPos.resolvedPosition} offset={tooltipPos.arrowOffset} />
          )}
          <p className="text-label-xs text-muted-foreground mb-1">
            STEP {globalStep} OF {TOTAL_STEPS}
          </p>

          <h3 className="font-display text-base font-semibold text-foreground">
            {step.title}
          </h3>

          <p className="font-sans text-sm text-muted-foreground mt-2 leading-relaxed">
            {step.description}
          </p>

          {/* Progress dots */}
          <div className="flex gap-1.5 mt-4">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  i === currentStep
                    ? 'w-4 bg-primary'
                    : i < currentStep
                    ? 'w-1.5 bg-primary/40'
                    : 'w-1.5 bg-muted'
                }`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 mt-4">
            {currentStep > 0 && (
              <Button variant="outline" size="sm" onClick={handleBack}>
                Back
              </Button>
            )}
            <Button size="sm" onClick={handleNext}>
              {currentStep === steps.length - 1
                ? stepOffset > 0
                  ? 'Finish Tour'
                  : 'Continue to Map →'
                : 'Next'}
            </Button>
            <button
              onClick={onSkip}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip tour
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
