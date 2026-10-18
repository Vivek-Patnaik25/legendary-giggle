import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { AccessibleModal } from './AccessibleModal.js';
import { pluralize } from '../utils/text.js';
import { Share2, Flame, Target, Trophy, Check, Copy } from 'lucide-react';

interface WeeklyReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WeeklyReportModal: React.FC<WeeklyReportModalProps> = ({ isOpen, onClose }) => {
  const { currentHousehold } = useAuth();
  const [report, setReport] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen || !currentHousehold) return;
    setIsLoading(true);

    fetch(`/api/households/${currentHousehold.id}/report/weekly`)
      .then(res => res.json())
      .then(data => {
        setReport(data.report);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [isOpen, currentHousehold]);

  const handleShare = async () => {
    const text = `Pantry Rescue Weekly Report for ${report?.householdName || 'our kitchen'}: Rescued ${report?.rescuedCount || 0} items this week with a ${report?.streakWeeks || 0}-week streak!`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Pantry Rescue Weekly Report',
          text,
          url: window.location.origin,
        });
        return;
      } catch {
        // Fallback to clipboard
      }
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Weekly Rescue Report"
      maxWidth="max-w-md"
    >
      {isLoading || !report ? (
        <div className="py-12 text-center text-xs text-stone-600 dark:text-stone-400">
          Compiling this week's food rescue report...
        </div>
      ) : (
        <div className="space-y-5">
          {/* Report Card Paper Container */}
          <div
            id="weekly-report-card"
            className="p-5 rounded-2xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/60 space-y-4"
          >
            {/* Header info */}
            <div className="flex items-center justify-between pb-3 border-b border-stone-200/80 dark:border-stone-800/80">
              <span className="font-serif font-bold text-sm text-stone-900 dark:text-stone-100">
                {report.householdName}
              </span>
              <span className="text-[11px] text-stone-600 dark:text-stone-400 font-medium">
                Week of {report.weekStart}
              </span>
            </div>

            {/* Mascot Commentary (touchpoint 3) */}
            <div className="flex items-center gap-3.5">
              <div className="w-14 h-14 shrink-0 rounded-xl overflow-hidden border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-800 p-0.5">
                <img
                  src={report.mascotImage || '/assets/sir_expiry_calm.png'}
                  alt="Sir Expiry"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold text-stone-600 dark:text-stone-400 uppercase tracking-wide">
                  Sir Expiry's dispatch
                </div>
                <p className="font-serif italic text-xs text-stone-800 dark:text-stone-200 mt-0.5 leading-snug">
                  "{report.commentary}"
                </p>
              </div>
            </div>

            {/* Numbers */}
            <div className="grid grid-cols-3 gap-2 text-center pt-1">
              <div className="p-2.5 rounded-xl bg-white dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700/80">
                <div className="font-serif text-lg font-bold text-stone-900 dark:text-stone-100">
                  {report.rescuedCount}
                </div>
                <div className="text-[10px] font-medium text-stone-600 dark:text-stone-400 uppercase mt-0.5">
                  Rescued
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-white dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700/80">
                <div className="font-serif text-lg font-bold text-stone-900 dark:text-stone-100">
                  {report.wastedCount}
                </div>
                <div className="text-[10px] font-medium text-stone-600 dark:text-stone-400 uppercase mt-0.5">
                  Wasted
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-white dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700/80">
                <div className="font-serif text-lg font-bold text-stone-900 dark:text-stone-100 flex items-center justify-center gap-0.5">
                  <span>{report.streakWeeks}</span>
                  <Flame className="w-3.5 h-3.5 text-apricot" />
                </div>
                <div className="text-[10px] font-medium text-stone-600 dark:text-stone-400 uppercase mt-0.5">
                  Streak
                </div>
              </div>
            </div>

            {/* Pact status */}
            <div className="flex items-center justify-between text-xs px-1">
              <div className="flex items-center gap-1.5 text-stone-600 dark:text-stone-400">
                <Target className="w-3.5 h-3.5" />
                <span>Limit: max {report.weeklyTarget} wasted</span>
              </div>
              <span className={`font-semibold text-[11px] ${
                report.isPactMet ? 'text-emerald-700 dark:text-emerald-400' : 'text-tomato'
              }`}>
                {report.isPactMet ? 'Target Kept' : 'Limit Exceeded'}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-semibold text-stone-600 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 transition cursor-pointer"
            >
              Close
            </button>

            <button
              type="button"
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-white text-stone-50 dark:text-stone-900 text-xs font-semibold rounded-xl shadow-xs transition active:scale-95 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copied summary</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Share report</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </AccessibleModal>
  );
};
