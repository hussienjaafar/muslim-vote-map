import { useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  type RangePreset,
  type RangeSelection,
  presetSelection,
  daySpan,
  etToday,
  MAX_CUSTOM_DAYS,
} from '@/lib/dateRanges';

const PRESETS: { key: Exclude<RangePreset, 'custom'>; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: '90d', label: '90D' },
];

// Parse a YYYY-MM-DD ET date string into a local Date for the calendar UI.
function toDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function toStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function DateRangePicker({
  value,
  onChange,
}: {
  value: RangeSelection;
  onChange: (sel: RangeSelection) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(
    value.preset === 'custom'
      ? { from: toDate(value.start), to: toDate(value.end) }
      : undefined
  );

  const today = toDate(etToday());
  const tooLong =
    draft?.from && draft?.to ? daySpan(toStr(draft.from), toStr(draft.to)) > MAX_CUSTOM_DAYS : false;

  const applyCustom = () => {
    if (!draft?.from) return;
    const start = toStr(draft.from);
    const end = toStr(draft.to ?? draft.from);
    if (daySpan(start, end) > MAX_CUSTOM_DAYS) return;
    onChange({ preset: 'custom', start, end });
    setOpen(false);
  };

  const pillBase =
    'px-3 h-8 text-xs font-bold rounded-[5px] transition-colors whitespace-nowrap';

  return (
    <div className="inline-flex flex-wrap items-center rounded-md border border-border bg-card/60 p-0.5 gap-0.5">
      {PRESETS.map((p) => (
        <button
          key={p.key}
          onClick={() => onChange(presetSelection(p.key))}
          className={cn(
            pillBase,
            value.preset === p.key
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {p.label}
        </button>
      ))}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              pillBase,
              'inline-flex items-center gap-1.5',
              value.preset === 'custom'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            Custom
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="range"
            selected={draft}
            onSelect={setDraft}
            numberOfMonths={2}
            disabled={{ after: today }}
            defaultMonth={draft?.from ?? today}
            className={cn('p-3 pointer-events-auto')}
          />
          <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2.5">
            <span className="text-[11px] text-muted-foreground">
              {tooLong
                ? `Max ${MAX_CUSTOM_DAYS} days`
                : draft?.from
                  ? `${daySpan(toStr(draft.from), toStr(draft.to ?? draft.from))} day(s)`
                  : 'Pick a start & end date'}
            </span>
            <button
              onClick={applyCustom}
              disabled={!draft?.from || tooLong}
              className="px-3 h-8 text-xs font-bold rounded-md bg-primary text-primary-foreground transition-opacity disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
