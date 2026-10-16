import React from 'react';
import { usePantry } from '../context/PantryContext.js';
import { useAuth } from '../context/AuthContext.js';
import { X, ChefHat, Check, Plus, Utensils, Clock, Users, Sparkles } from 'lucide-react';

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
    // Decrement used items from pantry
    if (recipe.usedPantryItems && recipe.usedPantryItems.length > 0) {
      for (const used of recipe.usedPantryItems) {
        await cookItem(used.id, Math.min(used.quantity, 1));
      }
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl p-6 sm:p-8 text-slate-100 max-h-[90vh] overflow-y-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-emerald-950 text-emerald-300 border border-emerald-600/30">
                {recipe.category}
              </span>
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span>{recipe.prepTimeMinutes} mins</span>
              </span>
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                <span>{recipe.servings || 4} servings</span>
              </span>
            </div>
            <h3 className="font-extrabold text-2xl text-slate-100">{recipe.title}</h3>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Ingredients Checklist */}
        <div className="space-y-3">
          <h4 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <ChefHat className="w-4 h-4 text-emerald-400" />
            <span>Ingredients Checklist</span>
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {recipe.ingredients.map((ing: any, idx: number) => {
              const inPantry = recipe.usedPantryItems?.some((u: any) =>
                u.name.toLowerCase().includes(ing.name.toLowerCase()) || ing.name.toLowerCase().includes(u.name.toLowerCase())
              );

              return (
                <div
                  key={idx}
                  className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 ${
                    inPantry
                      ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
                      : 'bg-slate-800/40 border-slate-700/60 text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    {inPantry ? (
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <Plus className="w-4 h-4 text-slate-500 shrink-0" />
                    )}
                    <span className="truncate capitalize">{ing.name}</span>
                  </div>
                  <span className="font-semibold text-slate-400 shrink-0">
                    {ing.quantity} {ing.unit}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Step-by-Step Instructions */}
        <div className="space-y-3">
          <h4 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
            Preparation Steps
          </h4>
          <ol className="space-y-2.5 text-xs sm:text-sm text-slate-300 list-decimal list-inside leading-relaxed bg-slate-800/40 p-4 rounded-xl border border-slate-800">
            {recipe.instructions.map((step: string, idx: number) => (
              <li key={idx} className="pl-1">
                {step}
              </li>
            ))}
          </ol>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-400 hover:text-slate-100 transition cursor-pointer"
          >
            Close
          </button>
          {!isGuest && (
            <button
              type="button"
              onClick={handleCookThisRecipe}
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 active:scale-98 text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-500/20 transition flex items-center gap-2 cursor-pointer"
            >
              <Utensils className="w-4 h-4" />
              <span>Cook Dinner (Consume Ingredients)</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
