import React, { useState } from 'react';
import { usePantry } from '../context/PantryContext.js';
import { useAuth } from '../context/AuthContext.js';
import { FreshnessBar } from './FreshnessBar.js';
import { cleanText, pluralize } from '../utils/text.js';
import {
  Flame,
  ChefHat,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Plus,
  HelpCircle,
  X,
} from 'lucide-react';

interface TodayViewProps {
  onOpenAddItem: () => void;
  onCookRecipe: (recipe: any) => void;
}

export const TodayView: React.FC<TodayViewProps> = ({ onOpenAddItem, onCookRecipe }) => {
  const { currentHousehold } = useAuth();
  const { items, rescueRecipes, cookItem, mascot } = usePantry();

  // Feedback state after tapping "Use"
  const [feedback, setFeedback] = useState<{ message: string; itemName: string } | null>(null);
  const [showFreshnessTooltip, setShowFreshnessTooltip] = useState(false);

  // Expiring soon: Top 3 urgent items sorted by urgency score
  const expiringSoon = items
    .filter(i => i.status === 'active' && i.current_quantity > 0)
    .sort((a, b) => (b.urgency?.score ?? 0) - (a.urgency?.score ?? 0))
    .slice(0, 3);

  const handleUseItem = async (itemId: string, name: string) => {
    await cookItem(itemId, 1);

    // Witty skippable feedback line (< 1s)
    const wittyLines = [
      'Rescued from the shadows of the crisper.',
      'Sir Expiry nods with quiet satisfaction.',
      'One less ingredient lost to the void.',
      'Crisper equilibrium restored.',
    ];
    const line = wittyLines[Math.floor(Math.random() * wittyLines.length)];
    setFeedback({ message: line, itemName: name });

    setTimeout(() => {
      setFeedback((prev) => (prev?.itemName === name ? null : prev));
    }, 950);
  };

  // Determine Sir Expiry's mood based on most urgent item
  const mostUrgentDays = expiringSoon[0]?.urgency?.daysRemaining;
  let mascotImage = '/assets/sir_expiry_calm.png';
  let mascotMoodTitle = 'Sir Expiry is calm';
  let mascotLine = 'All items are safely within their prime.';

  if (expiringSoon.length > 0) {
    if (mostUrgentDays !== null && mostUrgentDays <= 1) {
      mascotImage = '/assets/sir_expiry_panicked.png';
      mascotMoodTitle = 'Sir Expiry is sounding the alarm';
      mascotLine = `Hasten! ${expiringSoon[0].name} is on the precipice of expiry.`;
    } else if (mostUrgentDays !== null && mostUrgentDays <= 3) {
      mascotImage = '/assets/sir_expiry_worried.png';
      mascotMoodTitle = 'Sir Expiry is watchful';
      mascotLine = `Time draws near for ${expiringSoon[0].name}. Plan tonight's dinner wisely.`;
    } else {
      mascotImage = '/assets/sir_expiry_calm.png';
      mascotMoodTitle = 'Sir Expiry is pleased';
      mascotLine = 'The crisper drawer remains in peaceful order.';
    }
  }

  return (
    <div className="space-y-8 pb-20 md:pb-8">
      {/* 1. Restrained Sir Expiry Header (Touchpoint 1 of 3) */}
      <section className="bg-stone-100 dark:bg-stone-850 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 sm:p-6 transition-all">
        <div className="flex items-center gap-4 sm:gap-5">
          <div className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 flex items-center justify-center">
            <img
              src={mascotImage}
              alt={mascotMoodTitle}
              className="w-full h-full object-contain filter drop-shadow-sm select-none"
            />
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wider uppercase text-amber-800 dark:text-amber-400">
                {mascotMoodTitle}
              </span>
            </div>
            <p className="font-display text-base sm:text-lg text-stone-900 dark:text-stone-100 italic leading-snug">
              "{mascotLine}"
            </p>
          </div>
        </div>
      </section>

      {/* Tactile Feedback Banner (skippable on tap, <1s) */}
      {feedback && (
        <div
          onClick={() => setFeedback(null)}
          className="bg-stone-900 text-stone-100 dark:bg-stone-100 dark:text-stone-900 px-4 py-3 rounded-xl shadow-lg flex items-center justify-between cursor-pointer animate-in fade-in slide-in-from-top-2 duration-150"
        >
          <div className="flex items-center gap-2.5 text-xs sm:text-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-emerald-600 shrink-0" />
            <span>
              Saved! Used <strong>{feedback.itemName}</strong>. {feedback.message}
            </span>
          </div>
          <X className="w-4 h-4 opacity-60 hover:opacity-100 shrink-0 ml-2" />
        </div>
      )}

      {/* 2. Expiring Soon Section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-xl text-stone-900 dark:text-stone-100">
              Expiring soon
            </h2>
            <button
              onClick={() => setShowFreshnessTooltip(!showFreshnessTooltip)}
              className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 transition p-1"
              title="Freshness bar explanation"
              aria-label="Explain freshness bar"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
          <span className="text-xs text-stone-500 dark:text-stone-400 font-medium">
            {pluralize(expiringSoon.length, 'item')} to rescue
          </span>
        </div>

        {/* Freshness Bar Tooltip (Explained once, dismissible) */}
        {showFreshnessTooltip && (
          <div className="text-xs bg-stone-200/80 dark:bg-stone-800 p-3 rounded-xl text-stone-700 dark:text-stone-300 flex items-start justify-between gap-2 border border-stone-300 dark:border-stone-700">
            <span>
              The freshness bar shifts from green (safe) to tomato (expiring soon) as the expiration date nears.
            </span>
            <button
              onClick={() => setShowFreshnessTooltip(false)}
              className="text-stone-500 hover:text-stone-800 dark:hover:text-stone-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {expiringSoon.length === 0 ? (
          <div className="bg-stone-50 dark:bg-stone-900/40 border border-dashed border-stone-300 dark:border-stone-800 rounded-2xl p-8 text-center space-y-3">
            <div className="w-14 h-14 mx-auto">
              <img
                src="/assets/sir_expiry_calm.png"
                alt="Empty fridge"
                className="w-full h-full object-contain opacity-80"
              />
            </div>
            <div className="space-y-1">
              <h3 className="font-display text-base text-stone-900 dark:text-stone-100">
                No items expiring soon
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 max-w-sm mx-auto">
                Add groceries or items from your kitchen to track freshness and receive dinner ideas.
              </p>
            </div>
            <button
              onClick={onOpenAddItem}
              className="px-4 py-2 bg-stone-900 dark:bg-stone-100 text-stone-100 dark:text-stone-900 text-xs font-semibold rounded-lg hover:opacity-90 transition cursor-pointer"
            >
              Add an item
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {expiringSoon.map((item) => (
              <div
                key={item.id}
                className="bg-white dark:bg-stone-850 border border-stone-200 dark:border-stone-800 rounded-xl p-4 shadow-sm hover:border-stone-300 dark:hover:border-stone-700 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-medium text-base text-stone-900 dark:text-stone-100">
                      {cleanText(item.name)}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 font-medium capitalize border border-stone-200 dark:border-stone-700">
                      {item.location}
                    </span>
                    <span className="text-xs text-stone-500 dark:text-stone-400">
                      {item.current_quantity} {item.unit}
                    </span>
                  </div>

                  {/* Single Freshness Bar */}
                  <div className="max-w-xs">
                    <FreshnessBar daysRemaining={item.urgency?.daysRemaining ?? null} />
                  </div>
                </div>

                {/* Tactile Single "Use" Action */}
                <button
                  onClick={() => handleUseItem(item.id, item.name)}
                  className="self-end sm:self-center px-4 py-2 bg-stone-900 dark:bg-stone-100 hover:bg-stone-800 dark:hover:bg-white text-stone-100 dark:text-stone-900 text-xs font-semibold rounded-lg shadow-sm transition active:scale-95 cursor-pointer"
                >
                  Use
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. Cook Section (Rescue Recipes) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-stone-900 dark:text-stone-100">
            Cook tonight
          </h2>
          <span className="text-xs text-stone-500 dark:text-stone-400">
            Ranked by expiring items
          </span>
        </div>

        {rescueRecipes.length === 0 ? (
          <div className="bg-stone-50 dark:bg-stone-900/40 border border-stone-200 dark:border-stone-800 rounded-xl p-6 text-center text-xs text-stone-500">
            Add staple items like eggs, onions, or tomatoes to unlock rescue recipes.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {rescueRecipes.map((recipe) => (
              <div
                key={recipe.id}
                className="bg-white dark:bg-stone-850 border border-stone-200 dark:border-stone-800 rounded-xl p-4 shadow-sm hover:border-stone-300 dark:hover:border-stone-700 transition flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
                    <span className="capitalize">{recipe.category}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{recipe.prepTimeMinutes} mins</span>
                    </span>
                  </div>

                  <h3 className="font-display font-medium text-base text-stone-900 dark:text-stone-100 leading-snug">
                    {cleanText(recipe.title)}
                  </h3>

                  {/* Matching Ingredients */}
                  <div className="text-xs text-stone-600 dark:text-stone-400 space-y-1">
                    <div className="flex items-center gap-1 font-medium text-stone-900 dark:text-stone-200">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>Uses {recipe.pantryItemsUsedCount} from your fridge</span>
                    </div>
                    {recipe.missingCount > 0 && (
                      <div className="flex items-center gap-1 text-stone-500">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                        <span>Needs: {recipe.missingIngredients?.map((m: any) => cleanText(m)).slice(0, 3).join(', ')}</span>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => onCookRecipe(recipe)}
                  className="w-full py-2 px-3 border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-900 dark:text-stone-100 text-xs font-semibold rounded-lg transition active:scale-98 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <ChefHat className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>Cook</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Single Floating Primary Add Action Button */}
      <button
        onClick={onOpenAddItem}
        className="fixed bottom-20 md:bottom-8 right-5 sm:right-8 z-40 p-4 bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-white text-stone-100 dark:text-stone-900 rounded-full shadow-xl transition active:scale-95 flex items-center gap-2 cursor-pointer"
        aria-label="Add item to fridge"
      >
        <Plus className="w-5 h-5 stroke-[2.5]" />
        <span className="text-xs font-bold pr-1 hidden sm:inline">Add item</span>
      </button>
    </div>
  );
};
