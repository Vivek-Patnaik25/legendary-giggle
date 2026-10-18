import React from 'react';
import { usePantry } from '../context/PantryContext.js';
import { useAuth } from '../context/AuthContext.js';
import { AccessibleModal } from './AccessibleModal.js';
import { cleanText } from '../utils/text.js';
import { ChefHat, Check, Plus, Utensils, Clock, Users, X } from 'lucide-react';

interface RecipeModalProps {
  recipe: any | null;
  isOpen: boolean;
  onClose: () => void;
}

export const RecipeModal: React.FC<RecipeModalProps> = ({ recipe, isOpen, onClose }) => {
  const { cookItem } = usePantry();
  const { currentHousehold } = useAuth();

  if (!isOpen || !recipe) return null;

  const isGuest = currentHousehold?.role === 'guest';

  const handleCookThisRecipe = async () => {
    if (recipe.usedPantryItems && recipe.usedPantryItems.length > 0) {
      for (const used of recipe.usedPantryItems) {
        await cookItem(used.id, Math.min(used.quantity, 1));
      }
    }
    onClose();
  };

  // Check if an ingredient is missing using the recipe's exact missingIngredients array
  const isIngredientMissing = (ingName: string) => {
    if (!recipe.missingIngredients || !Array.isArray(recipe.missingIngredients)) {
      return false;
    }
    const cleanIng = ingName.toLowerCase().trim();
    return recipe.missingIngredients.some((m: any) => {
      const cleanMissing = (typeof m === 'string' ? m : m.name || '').toLowerCase().trim();
      return cleanMissing === cleanIng || cleanMissing.includes(cleanIng) || cleanIng.includes(cleanMissing);
    });
  };

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title={cleanText(recipe.title)}
      maxWidthClass="max-w-xl"
    >
      <div className="space-y-5">
        {/* Title above category tags */}
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-serif text-xl sm:text-2xl font-bold text-stone-900 dark:text-stone-100 leading-snug">
            {cleanText(recipe.title)}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition cursor-pointer shrink-0"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Metadata row */}
        <div className="flex items-center gap-3 text-xs text-stone-500 pb-3 border-b border-stone-100 dark:border-stone-800">
          <span className="px-2 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-medium capitalize">
            {cleanText(recipe.category || 'Dinner')}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-stone-400" />
            <span>{recipe.prepTimeMinutes || 30} mins</span>
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5 text-stone-400" />
            <span>{recipe.servings || 4} servings</span>
          </span>
        </div>

        {/* Ingredients Checklist */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="font-serif font-bold text-sm text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
              <ChefHat className="w-4 h-4 text-stone-500" />
              <span>Ingredients</span>
            </h4>
            <span className="text-[11px] text-stone-500">
              {recipe.usedPantryItems?.length || 0} available in your fridge
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {recipe.ingredients.map((ing: any, idx: number) => {
              const missing = isIngredientMissing(ing.name);
              const inPantry = !missing;

              return (
                <div
                  key={idx}
                  className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition ${
                    inPantry
                      ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/40 text-stone-900 dark:text-emerald-200 font-medium'
                      : 'bg-stone-50/60 dark:bg-stone-900/40 border-stone-200/80 dark:border-stone-800/80 text-stone-500'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    {inPantry ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <Plus className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    )}
                    <span className="truncate">{cleanText(ing.name)}</span>
                  </div>
                  <span className="text-[11px] text-stone-400 shrink-0 font-normal">
                    {ing.quantity} {ing.unit}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Preparation Steps */}
        <div className="space-y-2.5">
          <h4 className="font-serif font-bold text-sm text-stone-900 dark:text-stone-100">
            Instructions
          </h4>
          <ol className="space-y-2 text-xs text-stone-700 dark:text-stone-300 leading-relaxed bg-stone-50 dark:bg-stone-900/40 p-4 rounded-xl border border-stone-200/80 dark:border-stone-800/80 list-decimal list-inside">
            {recipe.instructions.map((step: string, idx: number) => (
              <li key={idx} className="pl-1">
                {cleanText(step)}
              </li>
            ))}
          </ol>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100 dark:border-stone-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 transition cursor-pointer"
          >
            Close
          </button>
          {!isGuest && (
            <button
              type="button"
              onClick={handleCookThisRecipe}
              className="px-4 py-2 bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-white text-stone-50 dark:text-stone-950 font-semibold text-xs rounded-xl shadow-sm transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
            >
              <Utensils className="w-3.5 h-3.5" />
              <span>Cook Dinner</span>
            </button>
          )}
        </div>
      </div>
    </AccessibleModal>
  );
};
