import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { usePantry } from '../context/PantryContext.js';
import {
  ShieldAlert,
  Moon,
  Sun,
  Wifi,
  WifiOff,
  RefreshCw,
  LogOut,
  Mail,
  Home,
  Plus,
  Settings,
  Award,
} from 'lucide-react';

interface NavbarProps {
  onOpenAddItem: () => void;
  onOpenDevInbox: () => void;
  onOpenSettings: () => void;
  onOpenReport: () => void;
  isDarkMode: boolean;
  setIsDarkMode: (val: boolean) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenAddItem,
  onOpenDevInbox,
  onOpenSettings,
  onOpenReport,
  isDarkMode,
  setIsDarkMode,
}) => {
  const { user, households, currentHousehold, setCurrentHousehold, logout } = useAuth();
  const { isOnline, pendingSyncCount, triggerSync } = usePantry();
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncClick = async () => {
    setIsSyncing(true);
    await triggerSync();
    setIsSyncing(false);
  };

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-slate-900/90 border-b border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl overflow-hidden shadow-md shadow-emerald-500/20 border border-emerald-500/30 flex items-center justify-center bg-emerald-950">
            <img src="/assets/logo.png" alt="Pantry Rescue Logo" className="w-full h-full object-cover" />
          </div>
          <div>
            <div className="font-bold text-lg tracking-tight bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
              Pantry Rescue
            </div>
            <div className="text-[10px] text-slate-400 font-medium tracking-wide">
              Shared Food Waste Shield
            </div>
          </div>
        </div>

        {/* Center: Household Switcher (if logged in) */}
        {user && currentHousehold && (
          <div className="hidden sm:flex items-center gap-2 bg-slate-800/80 rounded-lg px-3 py-1.5 border border-slate-700/60">
            <Home className="w-4 h-4 text-emerald-400" />
            <select
              value={currentHousehold.id}
              onChange={(e) => {
                const selected = households.find(h => h.id === e.target.value);
                if (selected) setCurrentHousehold(selected);
              }}
              className="bg-transparent text-sm font-medium text-slate-200 outline-none cursor-pointer pr-2"
              aria-label="Select household"
            >
              {households.map((h) => (
                <option key={h.id} value={h.id} className="bg-slate-800 text-slate-100">
                  {h.name} ({h.role})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Right Action Icons */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Quick Add Button */}
          {user && currentHousehold && (
            <button
              onClick={onOpenAddItem}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-medium text-xs sm:text-sm rounded-lg shadow-sm shadow-emerald-500/30 transition-all cursor-pointer"
              title="Add pantry item fast"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span className="hidden xs:inline">Add Item</span>
            </button>
          )}

          {/* Online / Offline Sync Badge */}
          <button
            onClick={handleSyncClick}
            disabled={!isOnline || isSyncing}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border transition-all cursor-pointer ${
              isOnline
                ? pendingSyncCount > 0
                  ? 'bg-amber-950/40 text-amber-300 border-amber-600/40 animate-pulse'
                  : 'bg-emerald-950/40 text-emerald-300 border-emerald-600/40'
                : 'bg-rose-950/40 text-rose-300 border-rose-600/40'
            }`}
            title={isOnline ? 'Online - click to sync' : 'Offline mode active'}
          >
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden md:inline">
                  {pendingSyncCount > 0 ? `${pendingSyncCount} syncing` : 'Online'}
                </span>
                {isSyncing && <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />}
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                <span>Offline</span>
              </>
            )}
          </button>

          {/* Dev Inbox Shortcut */}
          <button
            onClick={onOpenDevInbox}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Local Dev Inbox (view tokens & emails)"
            aria-label="Open developer inbox"
          >
            <Mail className="w-4 h-4" />
          </button>

          {/* Weekly Report Card Action */}
          {user && (
            <button
              onClick={onOpenReport}
              className="p-2 text-slate-400 hover:text-emerald-300 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Weekly Rescue Report Card"
              aria-label="Weekly Rescue Report Card"
            >
              <Award className="w-4 h-4" />
            </button>
          )}

          {/* Household Settings */}
          {user && currentHousehold && (
            <button
              onClick={onOpenSettings}
              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Household Settings & Invites"
              aria-label="Household Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}

          {/* Dark Mode Toggle */}
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Toggle theme"
            aria-label="Toggle dark mode"
          >
            {isDarkMode ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-slate-400" />}
          </button>

          {/* Logout */}
          {user && (
            <button
              onClick={logout}
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Log out"
              aria-label="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
