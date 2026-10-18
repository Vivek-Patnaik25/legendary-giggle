import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext.js';
import { Navbar } from './components/Navbar.js';
import { TodayView } from './components/TodayView.js';
import { FridgeView } from './components/FridgeView.js';
import { WinsView } from './components/WinsView.js';
import { AddItemModal } from './components/AddItemModal.js';
import { RecipeModal } from './components/RecipeModal.js';
import { WeeklyReportModal } from './components/WeeklyReportModal.js';
import { HouseholdSettingsModal } from './components/HouseholdSettingsModal.js';
import { DevInboxModal } from './components/DevInboxModal.js';
import { AuthModal } from './components/AuthModal.js';
import { checkDay1Return } from './analytics.js';

export const App: React.FC = () => {
  const { user, currentHousehold, isLoading } = useAuth();

  const [currentTab, setCurrentTab] = useState<'today' | 'fridge' | 'wins'>('today');
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDevInboxOpen, setIsDevInboxOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'claim' | 'login' | 'register'>('claim');
  const [selectedRecipe, setSelectedRecipe] = useState<any | null>(null);

  // Dark mode theme: light by default
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark';
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  // Check URL query parameters for ?dev=true or ?invite=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('dev') === 'true' || params.get('inbox') === 'true') {
      setIsDevInboxOpen(true);
    }
    if (params.get('invite')) {
      setAuthModalMode('register');
      setIsAuthModalOpen(true);
    }
  }, []);

  // Track day 1 return
  useEffect(() => {
    if (currentHousehold?.id) {
      checkDay1Return(currentHousehold.id);
    }
  }, [currentHousehold?.id]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-paper dark:bg-stone-950 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl overflow-hidden border border-stone-200 dark:border-stone-800 bg-stone-100 dark:bg-stone-900 p-1">
            <img src="/assets/logo.png" alt="Loading" className="w-full h-full object-cover animate-pulse" />
          </div>
          <span className="text-xs font-serif font-medium text-stone-500">
            Checking your kitchen...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper dark:bg-stone-950 text-stone-900 dark:text-stone-100 flex flex-col font-sans transition-colors selection:bg-stone-200 dark:selection:bg-stone-800">
      {/* Top Header & Mobile Bottom Bar Navigation */}
      <Navbar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        onOpenAddItem={() => setIsAddItemOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenClaim={() => {
          setAuthModalMode('claim');
          setIsAuthModalOpen(true);
        }}
        onOpenDevInbox={() => setIsDevInboxOpen(true)}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 pt-6">
        {currentTab === 'today' && (
          <TodayView
            onOpenAddItem={() => setIsAddItemOpen(true)}
            onCookRecipe={(recipe) => setSelectedRecipe(recipe)}
          />
        )}

        {currentTab === 'fridge' && (
          <FridgeView onOpenAddItem={() => setIsAddItemOpen(true)} />
        )}

        {currentTab === 'wins' && (
          <WinsView onOpenReport={() => setIsReportOpen(true)} />
        )}
      </main>

      {/* Modals */}
      <AddItemModal
        isOpen={isAddItemOpen}
        onClose={() => setIsAddItemOpen(false)}
      />

      <RecipeModal
        recipe={selectedRecipe}
        isOpen={Boolean(selectedRecipe)}
        onClose={() => setSelectedRecipe(null)}
      />

      <WeeklyReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
      />

      <HouseholdSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        defaultMode={authModalMode}
      />

      <DevInboxModal
        isOpen={isDevInboxOpen}
        onClose={() => setIsDevInboxOpen(false)}
      />
    </div>
  );
};
