import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  X,
  Users,
  UserPlus,
  Copy,
  Check,
  Shield,
  Trash2,
  Clock,
  Target,
  AlertTriangle,
} from 'lucide-react';

interface HouseholdSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HouseholdSettingsModal: React.FC<HouseholdSettingsModalProps> = ({ isOpen, onClose }) => {
  const { currentHousehold, refreshAuth } = useAuth();

  const [members, setMembers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [inviteRole, setInviteRole] = useState<'member' | 'guest'>('member');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [weeklyTarget, setWeeklyTarget] = useState(currentHousehold?.weekly_waste_target || 2.0);
  const [isSavingTarget, setIsSavingTarget] = useState(false);

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

  if (!isOpen || !currentHousehold) return null;

  const handleCreateInvite = async () => {
    try {
      const res = await fetch(`/api/households/${currentHousehold.id}/invites`, {
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
      await fetch(`/api/households/${currentHousehold.id}/invites/${inviteId}`, {
        method: 'DELETE',
      });
      await loadData();
    } catch {
      // ignore
    }
  };

  const handleRemoveMember = async (memberUserId: string) => {
    if (!confirm('Are you sure you want to remove this member from the household?')) return;
    try {
      await fetch(`/api/households/${currentHousehold.id}/members/${memberUserId}`, {
        method: 'DELETE',
      });
      await loadData();
    } catch {
      // ignore
    }
  };

  const handleSaveTarget = async () => {
    setIsSavingTarget(true);
    try {
      await fetch(`/api/households/${currentHousehold.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weeklyWasteTarget: weeklyTarget }),
      });
      await refreshAuth();
    } finally {
      setIsSavingTarget(false);
    }
  };

  const copyInviteLink = (code: string) => {
    const inviteUrl = `${window.location.origin}/?invite=${code}`;
    navigator.clipboard?.writeText(inviteUrl);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl p-6 text-slate-100 max-h-[90vh] overflow-y-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-lg text-slate-100">{currentHousehold.name} Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 1. Household Pact Weekly Target */}
        {isOwner && (
          <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Target className="w-4 h-4 text-indigo-400" />
              <span>Weekly Household Pact Target</span>
            </div>
            <p className="text-xs text-slate-400">
              Max number of wasted items allowed per week to maintain your household rescue streak:
            </p>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                step="0.5"
                value={weeklyTarget}
                onChange={(e) => setWeeklyTarget(parseFloat(e.target.value) || 0)}
                className="w-24 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-100 outline-none"
              />
              <button
                type="button"
                onClick={handleSaveTarget}
                disabled={isSavingTarget}
                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                {isSavingTarget ? 'Saving...' : 'Update Target'}
              </button>
            </div>
          </div>
        )}

        {/* 2. Invite Members */}
        {isOwner && (
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-emerald-400" />
              <span>Generate Household Invite Link</span>
            </h4>
            <div className="flex gap-2">
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as any)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none cursor-pointer"
              >
                <option value="member">Member (Full Access)</option>
                <option value="guest">Guest (View Only)</option>
              </select>
              <button
                type="button"
                onClick={handleCreateInvite}
                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg transition cursor-pointer"
              >
                Create Invite
              </button>
            </div>

            {/* Active Invites List */}
            {invites.length > 0 && (
              <div className="space-y-2 pt-1">
                {invites.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs">
                    <div>
                      <div className="font-mono text-emerald-300 font-bold">{inv.code}</div>
                      <div className="text-[11px] text-slate-400">Role: {inv.role} &bull; Expires in 7 days</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => copyInviteLink(inv.code)}
                        className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded flex items-center gap-1 cursor-pointer"
                      >
                        {copiedCode === inv.code ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedCode === inv.code ? 'Copied' : 'Copy'}</span>
                      </button>
                      <button
                        onClick={() => handleRevokeInvite(inv.id)}
                        className="p-1 hover:text-rose-400 text-slate-500 cursor-pointer"
                        title="Revoke invite"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 3. Members List */}
        <div className="space-y-3">
          <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-400" />
            <span>Active Household Members ({members.length})</span>
          </h4>
          <div className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-800/40 overflow-hidden text-xs">
            {members.map((m) => (
              <div key={m.id} className="p-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-100">{m.display_name}</div>
                  <div className="text-slate-400 text-[11px]">{m.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    m.role === 'owner'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : m.role === 'member'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-slate-700 text-slate-300'
                  }`}>
                    {m.role}
                  </span>
                  {isOwner && m.role !== 'owner' && (
                    <button
                      onClick={() => handleRemoveMember(m.user_id)}
                      className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer"
                      title="Remove member"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
