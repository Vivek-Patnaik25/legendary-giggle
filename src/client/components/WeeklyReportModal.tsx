import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { X, Share2, Award, Flame, CheckCircle2, Target, Sparkles, Download } from 'lucide-react';

interface WeeklyReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WeeklyReportModal: React.FC<WeeklyReportModalProps> = ({ isOpen, onClose }) => {
  const { currentHousehold } = useAuth();
  const [report, setReport] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl p-6 text-slate-100 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-lg text-slate-100">Weekly Rescue Report Card</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading || !report ? (
          <div className="p-12 text-center text-slate-400 text-sm">Generating your report card...</div>
        ) : (
          <div className="space-y-6 pt-4">
            {/* The Shareable Card Canvas / Visual Container */}
            <div
              id="weekly-report-card"
              className="relative overflow-hidden rounded-2xl border-2 border-emerald-500/40 p-6 sm:p-8 shadow-2xl bg-slate-950"
              style={{
                backgroundImage: `linear-gradient(to bottom, rgba(15, 23, 42, 0.88), rgba(15, 23, 42, 0.95)), url('${report.cardBackgroundImage}')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              {/* Subtle top branding */}
              <div className="flex items-center justify-between border-b border-slate-700/60 pb-4 mb-6">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg overflow-hidden bg-emerald-950 border border-emerald-500/40">
                    <img src="/assets/logo.png" alt="Logo" className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <div className="font-black text-sm tracking-tight text-emerald-400">Pantry Rescue</div>
                    <div className="text-[10px] text-slate-400">Weekly Household Performance</div>
                  </div>
                </div>
                <div className="text-right text-[11px] text-slate-400">
                  Week of <strong>{report.weekStart}</strong>
                </div>
              </div>

              {/* Household Name & Sir Expiry Speech */}
              <div className="flex flex-col sm:flex-row items-center gap-5 mb-6 text-center sm:text-left">
                <div className="w-20 h-20 shrink-0 rounded-2xl overflow-hidden border-2 border-emerald-500/40 bg-slate-900 shadow-lg">
                  <img src={report.mascotImage} alt="Sir Expiry" className="w-full h-full object-cover" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xl font-black text-slate-100 tracking-tight">{report.householdName}</h4>
                  <p className="text-sm italic text-emerald-300">"{report.commentary}"</p>
                </div>
              </div>

              {/* Key Stats Showcase */}
              <div className="grid grid-cols-3 gap-3 text-center my-6">
                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-700/60">
                  <div className="text-2xl font-black text-emerald-400">{report.rescuedCount}</div>
                  <div className="text-[11px] text-slate-400 font-semibold uppercase">Rescued</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-700/60">
                  <div className="text-2xl font-black text-rose-400">{report.wastedCount}</div>
                  <div className="text-[11px] text-slate-400 font-semibold uppercase">Wasted</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-700/60">
                  <div className="text-2xl font-black text-amber-400 flex items-center justify-center gap-1">
                    <span>{report.streakWeeks}</span>
                    <Flame className="w-4 h-4 fill-amber-400" />
                  </div>
                  <div className="text-[11px] text-slate-400 font-semibold uppercase">Wk Streak</div>
                </div>
              </div>

              {/* Household Pact Status */}
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-700/60 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-indigo-400" />
                  <span className="text-slate-300">Weekly Target: max {report.weeklyTarget} wasted</span>
                </div>
                <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${report.isPactMet ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                  {report.isPactMet ? 'Pact Kept!' : 'Pact Exceeded'}
                </span>
              </div>

              {/* Badges Earned */}
              {report.badges && report.badges.length > 0 && (
                <div className="mt-6 pt-4 border-t border-slate-700/60">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 text-center sm:text-left">
                    Household Achievements
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                    {report.badges.slice(0, 3).map((b: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-amber-500/30 text-xs">
                        <img src={b.icon} alt={b.title} className="w-5 h-5 rounded object-cover" />
                        <span className="font-semibold text-slate-200">{b.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-slate-400 hover:text-slate-100 transition cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(window.location.href);
                  alert('Report link copied to clipboard!');
                }}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                <span>Share Card</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
