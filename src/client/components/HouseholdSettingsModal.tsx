import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { AccessibleModal } from './AccessibleModal.js';
import { cleanText } from '../utils/text.js';
import {
  Users,
  UserPlus,
  Copy,
  Check,
  Shield,
  Trash2,
  Clock,
  Target,
  Settings,
  X,
} from 'lucide-react';

interface HouseholdSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenClaim?: () => void;
}

export const HouseholdSettingsModal: React.FC<HouseholdSettingsModalProps> = ({ isOpen, onClose, onOpenClaim }) => {
  const { user, currentHousehold, refreshAuth } = useAuth();

  const [members, setMembers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [inviteRole, setInviteRole] = useState<'member' | 'guest'>('member');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [weeklyTarget, setWeeklyTarget] = useState(currentHousehold?.weekly_waste_target || 2.0);
  const [isSavingTarget, setIsSavingTarget] = useState(false);
  const [targetMessage, setTargetMessage] = useState('');

  const isOwner = currentHousehold?.role === 'owner';

  const loadData = async () => {
    if (!currentHousehold) return;
    try {
      const res = await fetch(`/api/households/${currentHousehold.id}`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
      }

      if (isOwner) {
        const invRes = await fetch(`/api/households/${currentHousehold.id}/invites`);
        if (invRes.ok) {
          const invData = await invRes.json();
          setInvites(invData.invites || []);
        }
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
      if (currentHousehold) {
        setWeeklyTarget(currentHousehold.weekly_waste_target || 2.0);
      }
    }
  }, [isOpen, currentHousehold]);

  const handleCreateInvite = async () => {
    try {
      const res = await fetch(`/api/households/${currentHousehold?.id}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: inviteRole, expiresInDays: 7 }),
      });
      if (res.ok) {
        await loadData();
      }
    } catch {
      // ignore
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      await fetch(`/api/households/${currentHousehold?.id}/invites/${inviteId}`, {
        method: 'DELETE',
      });
      await loadData();
    } catch {
      // ignore
    }
  };

  const handleRemoveMember = async (memberUserId: string) => {
    if (!confirm('Remove this member from the kitchen?')) return;
    try {
      await fetch(`/api/households/${currentHousehold?.id}/members/${memberUserId}`, {
        method: 'DELETE',
      });
      await loadData();
    } catch {
      // ignore
    }
  };

  const handleSaveWasteTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingTarget(true);
    setTargetMessage('');
    try {
      const res = await fetch(`/api/households/${currentHousehold?.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekly_waste_target: Number(weeklyTarget) }),
      });
      if (res.ok) {
        setTargetMessage('Waste target saved.');
        await refreshAuth();
      }
    } catch {
      setTargetMessage('Failed to update target.');
    } finally {
      setIsSavingTarget(false);
    }
  };

  const copyToClipboard = (text: string) => {
    const inviteUrl = `${window.location.origin}?invite=${text}`;
    navigator.clipboard?.writeText(inviteUrl);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const isGuest = user?.isGuest || currentHousehold?.role === 'guest';

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title={`${cleanText(currentHousehold?.name || 'Kitchen')} Settings`}
      maxWidth="max-w-lg"
    >
      <div className="space-y-6">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-stone-800">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-stone-700 dark:text-stone-300" />
            <h3 className="font-serif text-lg font-bold text-stone-900 dark:text-stone-100">
              {cleanText(currentHousehold?.name || 'Kitchen')} Settings
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition cursor-pointer"
            aria-label="Close settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Guest Autosave Info & Claim Action */}
        {isGuest && (
          <div className="bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-stone-900 dark:text-stone-100">
                Guest Kitchen (Autosaved)
              </span>
              <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-relaxed">
                All food items, rescues, and streaks are automatically saved on this device. Create an account to invite family members or access on other devices.
              </p>
            </div>
            {onOpenClaim && (
              <button
                type="button"
                onClick={onOpenClaim}
                className="self-start sm:self-center px-3 py-1.5 bg-stone-900 dark:bg-stone-100 text-stone-50 dark:text-stone-900 text-xs font-semibold rounded-lg hover:opacity-90 transition cursor-pointer shrink-0"
              >
                Claim kitchen
              </button>
            )}
          </div>
        )}

        {/* Waste Reduction Target */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-stone-600 dark:text-stone-400" />
            <h4 className="font-serif font-bold text-sm text-stone-900 dark:text-stone-100">
              Household Waste Limit
            </h4>
          </div>
          <p className="text-xs text-stone-600 dark:text-stone-400">
            Set your weekly waste ceiling. Rescues must keep waste below this target to maintain streaks.
          </p>

          <form onSubmit={handleSaveWasteTarget} className="flex items-center gap-2">
            <input
              type="number"
              step="0.5"
              min="0"
              disabled={!isOwner}
              value={weeklyTarget}
              onChange={(e) => setWeeklyTarget(parseFloat(e.target.value) || 0)}
              className="w-24 px-3 py-1.5 text-xs bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl text-stone-900 dark:text-stone-100 outline-none"
            />
            <span className="text-xs text-stone-600 dark:text-stone-400">items/week</span>
            {isOwner && (
              <button
                type="submit"
                disabled={isSavingTarget}
                className="px-3.5 py-1.5 bg-stone-900 dark:bg-stone-100 text-stone-50 dark:text-stone-900 text-xs font-semibold rounded-xl hover:opacity-90 transition cursor-pointer disabled:opacity-50"
              >
                {isSavingTarget ? 'Saving...' : 'Save'}
              </button>
            )}
            {targetMessage && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                {targetMessage}
              </span>
            )}
          </form>
        </section>

        {/* Household Members */}
        <section className="space-y-3 pt-3 border-t border-stone-100 dark:border-stone-800">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-stone-600 dark:text-stone-400" />
            <h4 className="font-serif font-bold text-sm text-stone-900 dark:text-stone-100">
              Members ({members.length})
            </h4>
          </div>

          <div className="space-y-2 text-xs">
            {members.map((m) => (
              <div
                key={m.userId}
                className="p-2.5 rounded-xl border border-stone-200/80 dark:border-stone-800/80 bg-stone-50/60 dark:bg-stone-900/40 flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold text-stone-900 dark:text-stone-100">
                    {cleanText(m.displayName || m.email)}
                  </div>
                  <div className="text-[11px] text-stone-600 dark:text-stone-400">{cleanText(m.email)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-stone-200/60 dark:bg-stone-800 text-stone-700 dark:text-stone-300 uppercase tracking-wider">
                    {m.role}
                  </span>
                  {isOwner && m.role !== 'owner' && (
                    <button
                      onClick={() => handleRemoveMember(m.userId)}
                      className="text-stone-500 hover:text-tomato p-1 transition cursor-pointer"
                      title="Remove member"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Invite Codes (Owner only) */}
        {isOwner && (
          <section className="space-y-3 pt-3 border-t border-stone-100 dark:border-stone-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-stone-600 dark:text-stone-400" />
                <h4 className="font-serif font-bold text-sm text-stone-900 dark:text-stone-100">
                  Invite Housemates
                </h4>
              </div>
              <button
                type="button"
                onClick={handleCreateInvite}
                className="px-3 py-1 bg-stone-900 dark:bg-stone-100 text-stone-50 dark:text-stone-900 text-xs font-semibold rounded-lg hover:opacity-90 transition cursor-pointer"
              >
                Create Invite Link
              </button>
            </div>

            {invites.length > 0 ? (
              <div className="space-y-2 text-xs">
                {invites.map((inv) => (
                  <div
                    key={inv.id}
                    className="p-2.5 rounded-xl border border-stone-200/80 dark:border-stone-800/80 bg-stone-50/60 dark:bg-stone-900/40 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-mono text-xs font-semibold text-stone-800 dark:text-stone-200">
                        {inv.code}
                      </div>
                      <div className="text-[10px] text-stone-600 dark:text-stone-400">
                        Role: {inv.role} &bull; Expires: {new Date(inv.expires_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => copyToClipboard(inv.code)}
                        className="px-2.5 py-1 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 text-xs font-medium flex items-center gap-1 hover:bg-stone-200 dark:hover:bg-stone-700 transition cursor-pointer"
                      >
                        {copiedCode === inv.code ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-500" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy Link</span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleRevokeInvite(inv.id)}
                        className="text-stone-500 hover:text-tomato p-1 transition cursor-pointer"
                        title="Revoke invite"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-stone-600 dark:text-stone-400 italic">No active invite links.</p>
            )}
          </section>
        )}

        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-stone-600 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </AccessibleModal>
  );
};
