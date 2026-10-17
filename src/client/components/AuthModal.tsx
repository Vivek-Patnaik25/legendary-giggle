import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { AccessibleModal } from './AccessibleModal.js';
import { Mail, Lock, User, Save, LogIn, ArrowRight } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose?: () => void;
  defaultMode?: 'claim' | 'login' | 'register';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose = () => {},
  defaultMode = 'claim',
}) => {
  const { user, login, register, claimGuest, refreshAuth } = useAuth();

  const isGuest = user?.isGuest;
  const [mode, setMode] = useState<'claim' | 'login' | 'register'>(
    isGuest ? 'claim' : defaultMode === 'claim' ? 'register' : defaultMode
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [householdName, setHouseholdName] = useState('Kitchen');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('invite');
    if (code) {
      setInviteCode(code);
      setMode('register');
    }
  }, []);

  useEffect(() => {
    if (isGuest) {
      setMode('claim');
    } else if (defaultMode) {
      setMode(defaultMode === 'claim' ? 'login' : defaultMode);
    }
  }, [isGuest, defaultMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (mode === 'claim') {
        await claimGuest(email, password, displayName);
        onClose();
      } else if (mode === 'register') {
        await register(email, password, displayName);
        if (inviteCode.trim()) {
          const redRes = await fetch(`/api/invites/${encodeURIComponent(inviteCode.trim())}/redeem`, {
            method: 'POST',
          });
          if (redRes.ok) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        } else {
          await fetch('/api/households', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: householdName || 'Kitchen' }),
          });
        }
        await refreshAuth();
        onClose();
      } else {
        await login(email, password);
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Authentication error');
    } finally {
      setIsLoading(false);
    }
  };

  const modalTitle =
    mode === 'claim'
      ? 'Save Your Kitchen'
      : mode === 'register'
      ? 'Create Household'
      : 'Sign In';

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        {/* Mode Selector */}
        <div className="flex rounded-lg bg-stone-100 dark:bg-stone-900/80 p-1 border border-stone-200 dark:border-stone-800 text-xs font-semibold">
          {isGuest && (
            <button
              type="button"
              onClick={() => { setMode('claim'); setError(''); }}
              className={`flex-1 py-1.5 rounded-md transition cursor-pointer ${
                mode === 'claim'
                  ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-xs'
                  : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
              }`}
            >
              Save Progress
            </button>
          )}
          <button
            type="button"
            onClick={() => { setMode('login'); setError(''); }}
            className={`flex-1 py-1.5 rounded-md transition cursor-pointer ${
              mode === 'login'
                ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-xs'
                : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setError(''); }}
            className={`flex-1 py-1.5 rounded-md transition cursor-pointer ${
              mode === 'register'
                ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-xs'
                : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            New Account
          </button>
        </div>

        {mode === 'claim' && (
          <p className="text-xs text-stone-500">
            Set an email and password to preserve your items and rescue milestones across devices.
          </p>
        )}

        {error && (
          <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-tomato">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {(mode === 'claim' || mode === 'register') && (
            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                Your Name
              </label>
              <input
                type="text"
                placeholder="e.g. Alex"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl text-stone-900 dark:text-stone-100 outline-none"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              placeholder="you@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl text-stone-900 dark:text-stone-100 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl text-stone-900 dark:text-stone-100 outline-none"
            />
          </div>

          {mode === 'register' && !inviteCode && (
            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                Kitchen Name
              </label>
              <input
                type="text"
                placeholder="e.g. Apartment 4B"
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl text-stone-900 dark:text-stone-100 outline-none"
              />
            </div>
          )}

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-white text-stone-50 dark:text-stone-950 font-semibold text-xs rounded-xl shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-50"
            >
              {isLoading
                ? 'Processing...'
                : mode === 'claim'
                ? 'Save Kitchen'
                : mode === 'register'
                ? 'Create Account'
                : 'Sign In'}
            </button>
          </div>
        </form>
      </div>
    </AccessibleModal>
  );
};
