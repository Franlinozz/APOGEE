import type { HeatmapCell } from '@/lib/types';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function intensityClass(count: number, max: number): string {
  if (count === 0 || max === 0) return 'bg-elevated';
  const ratio = count / max;
  if (ratio < 0.25) return 'bg-accent/20';
  if (ratio < 0.5) return 'bg-accent/40';
  if (ratio < 0.75) return 'bg-accent/65';
  return 'bg-accent/90';
}

export function DashboardHeatmap({ cells }: { cells: HeatmapCell[] }) {
  const lookup = new Map(cells.map((c) => [`${c.day}-${c.hour}`, c.count]));
  const max = Math.max(0, ...cells.map((c) => c.count));

  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-surface p-5">
      <div className="overflow-x-auto">
        {/* Hour labels */}
        <div
          className="mb-1 grid"
          style={{ gridTemplateColumns: '40px repeat(24, minmax(16px, 1fr))' }}
        >
          <div />
          {HOURS.map((h) => (
            <div key={h} className="text-center text-[9px] text-fg-faint leading-none">
              {h % 6 === 0 ? `${h}h` : ''}
            </div>
          ))}
        </div>

        {/* Grid rows */}
        {DAYS.map((day, di) => (
          <div
            key={day}
            className="mb-1 grid"
            style={{ gridTemplateColumns: '40px repeat(24, minmax(16px, 1fr))' }}
          >
            <div className="flex items-center text-[10px] text-fg-faint leading-none">{day}</div>
            {HOURS.map((hour) => {
              const count = lookup.get(`${di}-${hour}`) ?? 0;
              return (
                <div
                  key={hour}
                  title={`${day} ${hour}:00 — ${count} receipts`}
                  className={[
                    'mx-px h-4 rounded-sm transition-colors',
                    intensityClass(count, max),
                  ].join(' ')}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-2">
        <span className="text-[9px] text-fg-faint">Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <div
            key={v}
            className={['h-3 w-3 rounded-sm', intensityClass(v * max, max)].join(' ')}
          />
        ))}
        <span className="text-[9px] text-fg-faint">More</span>
      </div>
    </div>
  );
}
