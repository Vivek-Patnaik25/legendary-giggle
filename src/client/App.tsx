import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext.js';
import { usePantry } from './context/PantryContext.js';
import { Navbar } from './components/Navbar.js';
import { RescueBoard } from './components/RescueBoard.js';
import { PantryInventory } from './components/PantryInventory.js';
import { ScoreboardView } from './components/ScoreboardView.js';
import { AddItemModal } from './components/AddItemModal.js';
import { RecipeModal } from './components/RecipeModal.js';
import { WeeklyReportModal } from './components/WeeklyReportModal.js';
import { HouseholdSettingsModal } from './components/HouseholdSettingsModal.js';
import { DevInboxModal } from './components/DevInboxModal.js';
import { AuthModal } from './components/AuthModal.js';
import { Flame, ShieldCheck, Utensils, Award, ChefHat, Sparkles } from 'lucide-react';

export const App: React.FC = () => {
  const { user, currentHousehold, isLoading } = useAuth();

  const [currentView, setCurrentView] = useState<'board' | 'inventory' | 'scoreboard'>('board');
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDevInboxOpen, setIsDevInboxOpen] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<any | null>(null);

  // Dark mode theme
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('theme') !== 'light';
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-xl overflow-hidden animate-pulse border border-emerald-500/30">
            <img src="/assets/logo.png" alt="Loading" className="w-full h-full object-cover" />
          </div>
          <div className="text-sm font-semibold text-emerald-400">Loading Pantry Rescue...</div>
        </div>
      </div>
    );
  }

  // Not logged in or no household: show Auth & Onboarding Modal
  if (!user || !currentHousehold) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <AuthModal isOpen={true} />
        {/* Floating Dev Inbox button on login screen */}
        <button
          onClick={() => setIsDevInboxOpen(true)}
          className="fixed bottom-4 right-4 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700 shadow cursor-pointer"
        >
          Open Dev Inbox
        </button>
        <DevInboxModal isOpen={isDevInboxOpen} onClose={() => setIsDevInboxOpen(false)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Top Navigation */}
      <Navbar
        onOpenAddItem={() => setIsAddItemOpen(true)}
        onOpenDevInbox={() => setIsDevInboxOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenReport={() => setIsReportOpen(true)}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {/* View Switcher Tabs (Desktop & Mobile) */}
        <div className="flex border-b border-slate-800 mb-6 gap-2 sm:gap-6 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setCurrentView('board')}
            className={`pb-3 px-2 text-sm sm:text-base font-bold flex items-center gap-2 border-b-2 transition cursor-pointer whitespace-nowrap ${
              currentView === 'board'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Flame className="w-4 h-4" />
            <span>Rescue Board</span>
          </button>

          <button
            onClick={() => setCurrentView('inventory')}
            className={`pb-3 px-2 text-sm sm:text-base font-bold flex items-center gap-2 border-b-2 transition cursor-pointer whitespace-nowrap ${
              currentView === 'inventory'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Utensils className="w-4 h-4" />
            <span>Pantry & Fridge</span>
          </button>

          <button
            onClick={() => setCurrentView('scoreboard')}
            className={`pb-3 px-2 text-sm sm:text-base font-bold flex items-center gap-2 border-b-2 transition cursor-pointer whitespace-nowrap ${
              currentView === 'scoreboard'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Award className="w-4 h-4" />
            <span>Scoreboard & Badges</span>
          </button>
        </div>

        {/* View Content */}
        {currentView === 'board' && (
          <RescueBoard
            onOpenAddItem={() => setIsAddItemOpen(true)}
            onCookRecipe={(recipe) => setSelectedRecipe(recipe)}
          />
        )}

        {currentView === 'inventory' && (
          <PantryInventory onOpenAddItem={() => setIsAddItemOpen(true)} />
        )}

        {currentView === 'scoreboard' && (
          <ScoreboardView onOpenReport={() => setIsReportOpen(true)} />
        )}
      </main>

      {/* Modals */}
      <AddItemModal isOpen={isAddItemOpen} onClose={() => setIsAddItemOpen(false)} />
      <RecipeModal
        recipe={selectedRecipe}
        isOpen={Boolean(selectedRecipe)}
        onClose={() => setSelectedRecipe(null)}
      />
      <WeeklyReportModal isOpen={isReportOpen} onClose={() => setIsReportOpen(false)} />
      <HouseholdSettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <DevInboxModal isOpen={isDevInboxOpen} onClose={() => setIsDevInboxOpen(false)} />
    </div>
  );
};
