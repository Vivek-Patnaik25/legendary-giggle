import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { usePantry } from '../context/PantryContext.js';
import {
  Moon,
  Sun,
  Wifi,
  WifiOff,
  RefreshCw,
  LogOut,
  Settings,
  Sparkles,
  Layers,
  Trophy,
  Save,
  ChevronDown,
} from 'lucide-react';

interface NavbarProps {
  currentTab: 'today' | 'fridge' | 'wins';
  onSelectTab: (tab: 'today' | 'fridge' | 'wins') => void;
  onOpenAddItem: () => void;
  onOpenSettings: () => void;
  onOpenClaim: () => void;
  onOpenDevInbox: () => void;
  isDarkMode: boolean;
  setIsDarkMode: (val: boolean) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  onOpenAddItem,
  onOpenSettings,
  onOpenClaim,
  onOpenDevInbox,
  isDarkMode,
  setIsDarkMode,
}) => {
  const { user, households, currentHousehold, setCurrentHousehold, logout } = useAuth();
  const { isOnline, pendingSyncCount, triggerSync } = usePantry();
  const [isSyncing, setIsSyncing] = useState(false);

  // Hidden keyboard shortcut for local dev inbox: Ctrl+Shift+D
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        onOpenDevInbox();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenDevInbox]);

  const handleSyncClick = async () => {
    if (!isOnline || isSyncing) return;
    setIsSyncing(true);
    await triggerSync();
    setIsSyncing(false);
  };

  const isGuest = user?.isGuest || currentHousehold?.role === 'guest';

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-stone-200 dark:border-stone-800 bg-paper/95 dark:bg-stone-950/95 backdrop-blur-md transition-colors">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-15 flex items-center justify-between gap-3">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg overflow-hidden border border-stone-200 dark:border-stone-800 bg-stone-100 dark:bg-stone-900 flex items-center justify-center shrink-0">
              <img src="/assets/logo.png" alt="Pantry Rescue" className="w-full h-full object-cover" />
            </div>
            <div>
              <span className="font-serif font-bold text-base tracking-tight text-stone-900 dark:text-stone-100">
                Pantry Rescue
              </span>
            </div>
          </div>

          {/* Desktop Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1 bg-stone-100 dark:bg-stone-900/80 p-1 rounded-xl border border-stone-200 dark:border-stone-800">
            {[
              { id: 'today', label: 'Today', icon: Sparkles },
              { id: 'fridge', label: 'Fridge', icon: Layers },
              { id: 'wins', label: 'Wins', icon: Trophy },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = currentTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onSelectTab(tab.id as any)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    isActive
                      ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-xs'
                      : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right Controls */}
          <div className="flex items-center gap-2">
            {/* Guest Claim Prompt */}
            {isGuest ? (
              <button
                onClick={onOpenClaim}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-stone-900 dark:bg-stone-100 text-stone-50 dark:text-stone-900 hover:opacity-90 transition cursor-pointer"
                title="Save this kitchen across devices"
              >
                <Save className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Save fridge</span>
              </button>
            ) : (
              /* Household selector for registered users */
              households.length > 1 && (
                <div className="hidden sm:flex items-center gap-1 text-xs text-stone-700 dark:text-stone-300 bg-stone-100 dark:bg-stone-900 px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800">
                  <select
                    value={currentHousehold?.id}
                    onChange={(e) => {
                      const sel = households.find(h => h.id === e.target.value);
                      if (sel) setCurrentHousehold(sel);
                    }}
                    className="bg-transparent outline-none cursor-pointer text-xs pr-1"
                    aria-label="Select household"
                  >
                    {households.map(h => (
                      <option key={h.id} value={h.id} className="bg-stone-100 dark:bg-stone-900">
                        {h.name}
                      </option>
                    ))}
                  </select>
                </div>
              )
            )}

            {/* Online / Offline Sync status pill */}
            <button
              onClick={handleSyncClick}
              disabled={!isOnline || isSyncing}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border transition cursor-pointer ${
                isOnline
                  ? pendingSyncCount > 0
                    ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800 animate-pulse'
                    : 'bg-stone-100 dark:bg-stone-900 text-stone-600 dark:text-stone-400 border-stone-200 dark:border-stone-800'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800'
              }`}
              title={isOnline ? (pendingSyncCount > 0 ? `${pendingSyncCount} changes pending sync` : 'Connected') : 'Offline'}
            >
              {isOnline ? (
                <>
                  <Wifi className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  <span className="hidden lg:inline text-[11px]">
                    {pendingSyncCount > 0 ? `${pendingSyncCount} pending` : 'Synced'}
                  </span>
                  {isSyncing && <RefreshCw className="w-3 h-3 animate-spin text-stone-500" />}
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3 text-tomato" />
                  <span className="text-[11px]">Offline</span>
                </>
              )}
            </button>

            {/* Settings (if not guest or registered) */}
            {!isGuest && (
              <button
                onClick={onOpenSettings}
                className="p-1.5 text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition cursor-pointer"
                title="Household settings & invites"
                aria-label="Household settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}

            {/* Dark Mode Toggle */}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-1.5 text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition cursor-pointer"
              title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle color theme"
            >
              {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-stone-600" />}
            </button>

            {/* Log Out (registered only) */}
            {!isGuest && (
              <button
                onClick={logout}
                className="p-1.5 text-stone-400 hover:text-tomato rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition cursor-pointer"
                title="Log out"
                aria-label="Log out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Bottom Tab Bar (375px responsive) */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-paper/95 dark:bg-stone-950/95 backdrop-blur-md border-t border-stone-200 dark:border-stone-800 h-16 flex items-center justify-around px-2"
        role="navigation"
        aria-label="Mobile navigation"
      >
        {[
          { id: 'today', label: 'Today', icon: Sparkles },
          { id: 'fridge', label: 'Fridge', icon: Layers },
          { id: 'wins', label: 'Wins', icon: Trophy },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id as any)}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition cursor-pointer ${
                isActive
                  ? 'text-stone-900 dark:text-stone-100'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.2]' : 'stroke-[1.8]'}`} />
              <span className={`text-[10px] mt-0.5 ${isActive ? 'font-bold' : 'font-medium'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
};
