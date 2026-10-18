import React from 'react';
import { usePantry } from '../context/PantryContext.js';
import { useAuth } from '../context/AuthContext.js';
import { pluralize, formatQuantityWithUnit } from '../utils/text.js';
import {
  Trophy,
  Flame,
  Target,
  Sparkles,
  Share2,
  Calendar,
  CheckCircle2,
  Lock,
} from 'lucide-react';

interface WinsViewProps {
  onOpenReport: () => void;
}

export const WinsView: React.FC<WinsViewProps> = ({ onOpenReport }) => {
  const { scoreboard, badges } = usePantry();
  const { currentHousehold } = useAuth();

  const rescued = scoreboard?.rescuedCount || 0;
  const wasted = scoreboard?.wastedCount || 0;
  const target = scoreboard?.weeklyTarget || 2.0;
  const streak = scoreboard?.streakWeeks || 0;
  const scorePercent = scoreboard?.scorePercentage || 100;
  const isPactMet = scoreboard?.isPactMet ?? true;

  // Compute fractional progress for locked badges
  const getBadgeProgress = (badgeKey: string, isUnlocked: boolean) => {
    if (isUnlocked) return { current: 1, total: 1, percent: 100, label: 'Unlocked' };

    switch (badgeKey) {
      case 'scrappy_chef': {
        const cur = Math.min(rescued, 5);
        return {
          current: cur,
          total: 5,
          percent: Math.round((cur / 5) * 100),
          label: `${cur} of 5 rescues this week`,
        };
      }
      case 'onion_survivor': {
        return {
          current: 0,
          total: 1,
          percent: 0,
          label: '0 of 1 urgent rescues',
        };
      }
      case 'freezer_archaeologist': {
        return {
          current: 0,
          total: 60,
          percent: 0,
          label: '0 of 60 days frozen',
        };
      }
      case 'pact_keeper': {
        return {
          current: isPactMet ? 1 : 0,
          total: 1,
          percent: isPactMet ? 100 : 0,
          label: isPactMet ? 'Target kept this week' : 'Target exceeded',
        };
      }
      default:
        return {
          current: 0,
          total: 1,
          percent: 0,
          label: 'In progress',
        };
    }
  };

  return (
    <div className="space-y-8 pb-36 sm:pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 dark:border-stone-800 pb-5">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
            Household Progress
          </span>
          <h2 className="font-serif text-2xl font-bold text-stone-900 dark:text-stone-100 tracking-tight mt-0.5">
            Wins & Milestones
          </h2>
          <p className="text-xs text-stone-500 mt-1">
            Tracking food saved from going to waste in <strong>{currentHousehold?.name || 'Kitchen'}</strong>
          </p>
        </div>

        <button
          onClick={onOpenReport}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-white text-stone-50 dark:text-stone-900 text-xs font-semibold rounded-xl shadow-sm transition active:scale-95 cursor-pointer self-start sm:self-auto"
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>Weekly Report Card</span>
        </button>
      </div>

      {/* 4 Essential Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Metric 1: Rescue Streak */}
        <div className="p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/60 shadow-sm">
          <div className="flex items-center justify-between text-stone-500 mb-1">
            <span className="text-xs font-medium">Rescue Streak</span>
            <Flame className="w-4 h-4 text-apricot" />
          </div>
          <div className="font-serif text-2xl font-bold text-stone-900 dark:text-stone-100 flex items-baseline gap-1.5">
            <span>{pluralize(streak, 'week')}</span>
            {scoreboard?.isDemoData && streak > 0 && (
              <span className="text-[10px] font-sans font-medium px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-500 border border-stone-200 dark:border-stone-700">
                Demo
              </span>
            )}
          </div>
          <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-1">
            Consecutive weeks below waste limit
          </p>
        </div>

        {/* Metric 2: Rescued Groceries */}
        <div className="p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/60 shadow-sm">
          <div className="flex items-center justify-between text-stone-500 mb-1">
            <span className="text-xs font-medium">Rescued</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="font-serif text-2xl font-bold text-stone-900 dark:text-stone-100">
            {pluralize(rescued, 'item')}
          </div>
          <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-1">
            Cooked before expiration this week
          </p>
        </div>

        {/* Metric 3: Rescue Efficiency */}
        <div className="p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/60 shadow-sm">
          <div className="flex items-center justify-between text-stone-500 mb-1">
            <span className="text-xs font-medium">Rescue Rate</span>
            <Trophy className="w-4 h-4 text-stone-400" />
          </div>
          <div className="font-serif text-2xl font-bold text-stone-900 dark:text-stone-100">
            {scorePercent}%
          </div>
          <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-1">
            Of processed food eaten, not binned
          </p>
        </div>

        {/* Metric 4: Waste vs Household Pact */}
        <div className={`p-4 rounded-xl border shadow-sm ${
          isPactMet
            ? 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/60'
            : 'border-rose-200 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-950/20'
        }`}>
          <div className="flex items-center justify-between text-stone-500 mb-1">
            <span className="text-xs font-medium">Waste vs Limit</span>
            <Target className="w-4 h-4 text-stone-400" />
          </div>
          <div className="font-serif text-2xl font-bold text-stone-900 dark:text-stone-100 flex items-baseline gap-1">
            <span>{wasted}</span>
            <span className="text-xs font-sans font-normal text-stone-500">/ max {target}</span>
          </div>
          <p className={`text-[11px] mt-1 ${isPactMet ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-tomato font-medium'}`}>
            {isPactMet ? 'Within household target' : 'Exceeded target limit'}
          </p>
        </div>
      </div>

      {/* Badges Section with Fractional Progress */}
      <section className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-stone-400" />
            <h3 className="font-serif text-lg font-bold text-stone-900 dark:text-stone-100">
              Achievements
            </h3>
          </div>
          <span className="text-xs text-stone-500">
            {badges.filter(b => b.isUnlocked).length} of {badges.length} unlocked
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {badges.map((badge) => {
            const prog = getBadgeProgress(badge.key, badge.isUnlocked);

            return (
              <div
                key={badge.key}
                className={`p-4 rounded-xl border flex flex-col justify-between transition ${
                  badge.isUnlocked
                    ? 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/70 shadow-sm'
                    : 'border-stone-200/60 dark:border-stone-800/60 bg-stone-50/50 dark:bg-stone-900/30'
                }`}
              >
                <div className="flex items-start gap-3.5">
                  <div className={`w-12 h-12 rounded-xl shrink-0 overflow-hidden border flex items-center justify-center p-1 ${
                    badge.isUnlocked
                      ? 'border-amber-200 dark:border-amber-900/60 bg-amber-50/30 dark:bg-amber-950/20'
                      : 'border-stone-200 dark:border-stone-800 bg-stone-100 dark:bg-stone-800/50'
                  }`}>
                    {badge.icon ? (
                      <img
                        src={badge.icon}
                        alt={badge.title}
                        className={`w-full h-full object-cover rounded-lg ${!badge.isUnlocked ? 'opacity-40' : ''}`}
                      />
                    ) : (
                      <Trophy className="w-5 h-5 text-stone-400" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <h4 className="font-semibold text-xs text-stone-900 dark:text-stone-100 truncate">
                        {badge.title}
                      </h4>
                      {badge.isUnlocked ? (
                        <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.2 rounded border border-emerald-200 dark:border-emerald-800/50 shrink-0">
                          Earned
                        </span>
                      ) : prog.percent > 0 ? (
                        <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-1.5 py-0.2 rounded border border-amber-200 dark:border-amber-800/50 shrink-0">
                          {prog.percent}%
                        </span>
                      ) : (
                        <Lock className="w-3 h-3 text-stone-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-stone-500 leading-snug mt-1 line-clamp-2">
                      {badge.description}
                    </p>
                  </div>
                </div>

                {/* Progress bar with distinct colors: Emerald for complete, Amber for in-progress */}
                <div className="mt-3.5 pt-2 border-t border-stone-100 dark:border-stone-800/80">
                  <div className="flex items-center justify-between text-[10px] text-stone-500 mb-1">
                    <span>{prog.label}</span>
                    {badge.isUnlocked && badge.unlockedAt && (
                      <span>{new Date(badge.unlockedAt).toLocaleDateString()}</span>
                    )}
                  </div>
                  <div className="w-full h-1.5 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        badge.isUnlocked
                          ? 'bg-emerald-500'
                          : prog.percent > 0
                          ? 'bg-amber-500'
                          : 'bg-transparent'
                      }`}
                      style={{ width: `${prog.percent}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Audit Trail */}
      {(() => {
        const visibleEvents = (scoreboard?.recentEvents || []).filter((evt: any) => {
          const isGram = (evt.unit || '').toLowerCase().trim() === 'g';
          const qty = Number(evt.quantity) || 0;
          return !(isGram && qty <= 1);
        });

        const isDemo = scoreboard?.isDemoData || visibleEvents.some((e: any) => e.id?.startsWith('evt-'));

        return (
          <section className="space-y-3 pt-4 border-t border-stone-200 dark:border-stone-800">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-stone-400" />
              <h3 className="font-serif text-base font-bold text-stone-900 dark:text-stone-100">
                Recent Activity
              </h3>
              {isDemo && visibleEvents.length > 0 && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-500 border border-stone-200 dark:border-stone-700">
                  Demo Data
                </span>
              )}
            </div>

            {visibleEvents.length > 0 ? (
              <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/60 divide-y divide-stone-100 dark:divide-stone-800/80 text-xs">
                {visibleEvents.map((evt: any) => (
                  <div key={evt.id} className="p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${
                        evt.event_type === 'rescued' ? 'bg-emerald-500' : 'bg-tomato'
                      }`} />
                      <span className="text-stone-700 dark:text-stone-300 truncate">
                        <strong className="font-semibold text-stone-900 dark:text-stone-100">
                          {evt.user_name || 'Member'}
                        </strong>{' '}
                        {evt.event_type === 'rescued' ? 'rescued' : 'discarded'}{' '}
                        <strong className="font-semibold text-stone-900 dark:text-stone-100">
                          {formatQuantityWithUnit(evt.quantity, evt.unit)}
                        </strong>
                      </span>
                    </div>
                    <span className="text-[11px] text-stone-500 dark:text-stone-400 shrink-0">{evt.date}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-stone-200 dark:border-stone-800 p-6 text-center text-xs text-stone-400">
                No food rescues or waste logged yet this week. Use or cook ingredients to record household rescues.
              </div>
            )}
          </section>
        );
      })()}
    </div>
  );
};
