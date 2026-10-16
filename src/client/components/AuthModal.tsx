import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { Sparkles, Key, Mail, User, ShieldAlert, ArrowRight } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen }) => {
  const { login, register, refreshAuth } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [householdName, setHouseholdName] = useState('My Kitchen');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Check URL query parameters for ?invite=<code>
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('invite');
    if (code) {
      setInviteCode(code);
      setMode('register');
    }
  }, []);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (mode === 'register') {
        await register(email, password, displayName);

        // If an invite code was supplied, redeem it automatically
        if (inviteCode.trim()) {
          const redRes = await fetch(`/api/invites/${encodeURIComponent(inviteCode.trim())}/redeem`, {
            method: 'POST',
          });
          if (redRes.ok) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        } else {
          // Otherwise, create initial household for the user
          await fetch('/api/households', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: householdName || 'My Kitchen' }),
          });
        }
        await refreshAuth();
      } else {
        await login(email, password);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
      <div className="relative w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl p-6 sm:p-8 text-slate-100">
        {/* Onboarding Mascot Header */}
        <div className="text-center space-y-3 mb-6">
          <div className="w-20 h-20 mx-auto rounded-2xl overflow-hidden border-2 border-emerald-500/40 shadow-xl shadow-emerald-500/10 bg-slate-800 p-1 flex items-center justify-center">
            <img src="/assets/sir_expiry_calm.png" alt="Sir Expiry Mascot" className="w-full h-full object-cover" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-100">
              Welcome to Pantry Rescue
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              "Never again shall a lone bell pepper perish in the shadows!" &mdash; Sir Expiry
            </p>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="flex rounded-lg bg-slate-800 p-1 mb-5 border border-slate-700/60">
          <button
            type="button"
            onClick={() => { setMode('register'); setError(''); }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer ${
              mode === 'register' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Create Household
          </button>
          <button
            type="button"
            onClick={() => { setMode('login'); setError(''); }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer ${
              mode === 'login' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Sign In
          </button>
        </div>

        {error && (
          <div className="p-3 mb-4 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Your Name</label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  required
                  placeholder="e.g. Maya"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Password</label>
            <div className="relative">
              <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                required
                minLength={6}
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {mode === 'register' && !inviteCode && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Household / Fridge Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Flat 4B, The Green Kitchen"
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 outline-none focus:border-emerald-500"
              />
            </div>
          )}

          {inviteCode && (
            <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs">
              Joining via invite code: <strong>{inviteCode}</strong>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 py-2.5 bg-emerald-500 hover:bg-emerald-600 active:scale-98 text-white font-bold text-sm rounded-lg shadow-lg shadow-emerald-500/20 transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>{isLoading ? 'Please wait...' : mode === 'register' ? 'Launch Pantry Rescue' : 'Sign In'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
