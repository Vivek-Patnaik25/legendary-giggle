import React from 'react';

interface FreshnessBarProps {
  daysRemaining: number | null;
  score?: number;
  className?: string;
  showLabel?: boolean;
}

export function formatDaysRemaining(days: number | null): string {
  if (days === null) return 'No date set';
  if (days < 0) return `${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} expired`;
  if (days === 0) return 'Expires today';
  if (days === 1) return '1 day left';
  return `${days} days left`;
}

export const FreshnessBar: React.FC<FreshnessBarProps> = ({
  daysRemaining,
  className = '',
  showLabel = true,
}) => {
  // Compute percentage (0 days left = 100% urgency / full bar; 10+ days = 10% bar)
  const days = daysRemaining ?? 7;
  let percent = 100;
  let barColor = 'bg-rose-600';
  let textColor = 'text-rose-600 dark:text-rose-400 font-semibold';

  if (days <= 0) {
    percent = 100;
    barColor = 'bg-rose-600';
    textColor = 'text-rose-600 dark:text-rose-400 font-bold';
  } else if (days <= 2) {
    percent = 85;
    barColor = 'bg-rose-500';
    textColor = 'text-rose-600 dark:text-rose-400 font-semibold';
  } else if (days <= 5) {
    percent = 55;
    barColor = 'bg-amber-500';
    textColor = 'text-amber-700 dark:text-amber-400 font-medium';
  } else {
    percent = 25;
    barColor = 'bg-emerald-600';
    textColor = 'text-emerald-700 dark:text-emerald-400 font-medium';
  }

  const label = formatDaysRemaining(daysRemaining);

  return (
    <div className={`space-y-1.5 ${className}`}>
      {showLabel && (
        <div className="flex items-center justify-between text-xs">
          <span className={textColor}>{label}</span>
        </div>
      )}
      <div
        className="w-full h-1.5 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Freshness: ${label}`}
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};
