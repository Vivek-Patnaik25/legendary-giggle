import React from 'react';
import { usePantry } from '../context/PantryContext.js';
import { useAuth } from '../context/AuthContext.js';
import {
  Award,
  Flame,
  Target,
  ShieldCheck,
  CheckCircle2,
  Trash2,
  Sparkles,
  Share2,
  Calendar,
} from 'lucide-react';
import { formatQuantityWithUnit } from '../utils/text.js';

interface ScoreboardViewProps {
  onOpenReport: () => void;
}

export const ScoreboardView: React.FC<ScoreboardViewProps> = ({ onOpenReport }) => {
  const { scoreboard, badges } = usePantry();
  const { currentHousehold } = useAuth();

  const rescued = scoreboard?.rescuedCount || 0;
  const wasted = scoreboard?.wastedCount || 0;
  const target = scoreboard?.weeklyTarget || 2.0;
  const streak = scoreboard?.streakWeeks || 0;
  const scorePercent = scoreboard?.scorePercentage || 100;
  const isPactMet = scoreboard?.isPactMet ?? true;

  return (
    <div className="space-y-8 pb-12">
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-100 flex items-center gap-2">
            <Award className="w-6 h-6 text-emerald-400" />
            <span>Household Scoreboard</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Gamified waste reduction progress for <strong>{currentHousehold?.name || 'Your Household'}</strong>
          </p>
        </div>

        <button
          onClick={onOpenReport}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm rounded-xl shadow-lg shadow-emerald-500/20 transition cursor-pointer"
        >
          <Share2 className="w-4 h-4" />
          <span>Weekly Report Card</span>
        </button>
      </div>

      {/* 2. Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Streak Flame */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-950/40 via-slate-800/80 to-slate-900 border border-amber-500/30 shadow-lg space-y-2">
          <div className="flex items-center justify-between text-amber-400">
            <span className="text-xs font-bold uppercase tracking-wider">Rescue Streak</span>
            <Flame className="w-5 h-5 fill-amber-400/20" />
          </div>
          <div className="text-3xl font-black text-slate-100 flex items-baseline gap-1.5">
            <span>{streak}</span>
            <span className="text-xs font-semibold text-amber-400">weeks</span>
          </div>
          <p className="text-[11px] text-slate-400">Consecutive weeks keeping waste below household target</p>
        </div>

        {/* Waste Reduction Score */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-slate-800/80 to-slate-900 border border-emerald-500/30 shadow-lg space-y-2">
          <div className="flex items-center justify-between text-emerald-400">
            <span className="text-xs font-bold uppercase tracking-wider">Rescue Efficiency</span>
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="text-3xl font-black text-slate-100 flex items-baseline gap-1.5">
            <span>{scorePercent}%</span>
          </div>
          <p className="text-[11px] text-slate-400">Percentage of handled groceries turned into meals</p>
        </div>

        {/* Rescued Count */}
        <div className="p-5 rounded-2xl bg-slate-800/80 border border-slate-700/80 shadow-lg space-y-2">
          <div className="flex items-center justify-between text-emerald-400">
            <span className="text-xs font-bold uppercase tracking-wider">Rescued This Week</span>
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="text-3xl font-black text-slate-100">
            {rescued}
          </div>
          <p className="text-[11px] text-slate-400">Items saved from expiration</p>
        </div>

        {/* Wasted vs Target */}
        <div className={`p-5 rounded-2xl border shadow-lg space-y-2 ${
          isPactMet
            ? 'bg-slate-800/80 border-slate-700/80'
            : 'bg-rose-950/30 border-rose-500/40'
        }`}>
          <div className="flex items-center justify-between text-slate-300">
            <span className="text-xs font-bold uppercase tracking-wider">Wasted vs Target</span>
            <Target className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="text-3xl font-black text-slate-100 flex items-baseline gap-1.5">
            <span>{wasted}</span>
            <span className="text-xs font-semibold text-slate-400">/ max {target}</span>
          </div>
          <p className={`text-[11px] font-medium ${isPactMet ? 'text-emerald-400' : 'text-rose-400'}`}>
            {isPactMet ? '✓ Household Pact on track!' : '⚠ Weekly waste target exceeded'}
          </p>
        </div>
      </div>

      {/* 3. Badges & Trophies Showcase */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h3 className="text-xl font-bold tracking-tight text-slate-100">Badges & Trophies</h3>
          </div>
          <span className="text-xs font-semibold text-slate-400">
            {badges.filter(b => b.isUnlocked).length} / {badges.length} Unlocked
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {badges.map((badge) => (
            <div
              key={badge.key}
              className={`p-4 rounded-xl border flex items-start gap-4 transition-all ${
                badge.isUnlocked
                  ? 'bg-slate-800/90 border-amber-500/40 shadow-md shadow-amber-500/5'
                  : 'bg-slate-900/60 border-slate-800 opacity-60'
              }`}
            >
              {/* Badge Icon Asset */}
              <div className="relative w-14 h-14 shrink-0 rounded-xl overflow-hidden bg-slate-950 border border-slate-700 flex items-center justify-center p-1">
                {badge.icon ? (
                  <img
                    src={badge.icon}
                    alt={badge.title}
                    className={`w-full h-full object-cover rounded-lg ${!badge.isUnlocked ? 'grayscale blur-[1px]' : ''}`}
                  />
                ) : (
                  <Award className="w-8 h-8 text-amber-400" />
                )}
              </div>

              {/* Badge Details */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-sm text-slate-100">{badge.title}</h4>
                  {badge.isUnlocked && (
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      Unlocked
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 leading-snug">{badge.description}</p>
                {badge.unlockedAt && (
                  <div className="text-[10px] text-emerald-400 pt-1">
                    Awarded: {new Date(badge.unlockedAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. Activity Audit Trail */}
      {(() => {
        const visibleEvents = (scoreboard?.recentEvents || []).filter((evt: any) => {
          const isGram = (evt.unit || '').toLowerCase().trim() === 'g';
          const qty = Number(evt.quantity) || 0;
          return !(isGram && qty <= 1);
        });

        if (visibleEvents.length === 0) return null;

        return (
          <section className="space-y-3 pt-4">
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span>Recent Activity Audit Trail</span>
            </h3>
            <div className="rounded-xl border border-slate-800 bg-slate-800/40 divide-y divide-slate-800 overflow-hidden text-xs">
              {visibleEvents.map((evt: any) => (
                <div key={evt.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-2 h-2 rounded-full ${evt.event_type === 'rescued' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                    <span className="text-slate-200">
                      <strong>{evt.user_name || 'Member'}</strong>{' '}
                      {evt.event_type === 'rescued' ? 'rescued' : 'marked as waste'}{' '}
                      <strong>{formatQuantityWithUnit(evt.quantity, evt.unit)}</strong>
                    </span>
                  </div>
                  <span className="text-slate-500 shrink-0">{evt.date}</span>
                </div>
              ))}
            </div>
          </section>
        );
      })()}
    </div>
  );
};
