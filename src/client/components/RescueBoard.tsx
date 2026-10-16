import React from 'react';
import { usePantry } from '../context/PantryContext.js';
import { useAuth } from '../context/AuthContext.js';
import {
  AlertTriangle,
  Flame,
  ChefHat,
  ShoppingBag,
  Clock,
  Sparkles,
  Utensils,
  Trash2,
  Bookmark,
  CheckCircle2,
  PlusCircle,
} from 'lucide-react';

interface RescueBoardProps {
  onOpenAddItem: () => void;
  onCookRecipe: (recipe: any) => void;
}

export const RescueBoard: React.FC<RescueBoardProps> = ({ onOpenAddItem, onCookRecipe }) => {
  const { currentHousehold } = useAuth();
  const { items, rescueRecipes, shoppingHints, mascot, cookItem, wasteItem, claimItem } = usePantry();

  // Urgent items: urgency score >= 60 or daysRemaining <= 3
  const urgentItems = items
    .filter(i => i.status === 'active' && (i.urgency.score >= 60 || (i.urgency.daysRemaining !== null && i.urgency.daysRemaining <= 3)))
    .slice(0, 8);

  const isGuest = currentHousehold?.role === 'guest';

  return (
    <div className="space-y-8 pb-12">
      {/* 1. Sir Expiry Mascot Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-800/90 via-slate-800/60 to-slate-900/90 p-5 sm:p-6 shadow-xl backdrop-blur-sm">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
          {/* Mascot Image */}
          <div className="relative w-24 h-24 sm:w-28 sm:h-28 shrink-0 rounded-2xl overflow-hidden border-2 border-emerald-500/40 shadow-lg shadow-emerald-500/20 bg-slate-900 flex items-center justify-center">
            <img
              src={mascot?.image || '/assets/sir_expiry_calm.png'}
              alt={mascot?.title || 'Sir Expiry'}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Dialogue & Status */}
          <div className="flex-1 text-center sm:text-left space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-600/30">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{mascot?.title || 'Sir Expiry is on Duty'}</span>
            </div>
            <p className="text-base sm:text-lg font-medium text-slate-100 italic leading-relaxed">
              "{mascot?.quote || 'Provisions are secure in the crisper drawer!'}"
            </p>
            <div className="text-xs text-slate-400">
              Mascot mood reflects fridge urgency levels &bull; Never mean, always theatrical.
            </div>
          </div>
        </div>
      </div>

      {/* 2. Urgent At-Risk Items Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-400" />
            <h2 className="text-xl font-bold tracking-tight text-slate-100">At-Risk Provisions</h2>
            <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {urgentItems.length} urgent
            </span>
          </div>
          <button
            onClick={onOpenAddItem}
            className="text-xs sm:text-sm font-medium text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
          >
            + Add item
          </button>
        </div>

        {urgentItems.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-8 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto opacity-90" />
            <h3 className="font-semibold text-slate-200">No urgent items in danger!</h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              Your fridge is currently in peaceful equilibrium. Add your groceries or scan a barcode to keep track of expiries.
            </p>
            <button
              onClick={onOpenAddItem}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg shadow-sm transition cursor-pointer"
            >
              Add Groceries
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {urgentItems.map((item) => (
              <div
                key={item.id}
                className={`relative flex flex-col justify-between p-4 rounded-xl border transition-all ${
                  item.urgency.tier === 'critical'
                    ? 'bg-rose-950/20 border-rose-500/40 hover:border-rose-500/60'
                    : 'bg-amber-950/20 border-amber-500/40 hover:border-amber-500/60'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="font-semibold text-slate-100 text-base leading-snug break-words">
                      {item.name}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${
                        item.urgency.tier === 'critical'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      Score {item.urgency.score}
                    </span>
                  </div>

                  <div className="text-xs text-slate-400 space-y-1">
                    <div className="flex items-center gap-1.5 text-slate-300 font-medium">
                      <span>{item.current_quantity} {item.unit}</span>
                      <span>&bull;</span>
                      <span className="capitalize">{item.location}</span>
                      {item.is_frozen && <span className="text-cyan-400 font-bold">[Frozen]</span>}
                    </div>

                    <div className="flex items-center gap-1 text-slate-400">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{item.urgency.explanation}</span>
                    </div>

                    {item.claimed_by_name && (
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-slate-800 text-indigo-300 border border-indigo-500/30">
                        <Bookmark className="w-3 h-3" />
                        <span>Claimed by {item.claimed_by_name}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Quick Item Actions */}
                {!isGuest && (
                  <div className="mt-4 pt-3 border-t border-slate-700/50 flex items-center justify-between gap-2">
                    <button
                      onClick={() => cookItem(item.id, item.current_quantity)}
                      className="flex-1 py-1.5 px-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
                      title="Used in cooking (Rescue)"
                    >
                      <Utensils className="w-3.5 h-3.5" />
                      <span>Cook</span>
                    </button>

                    <button
                      onClick={() => wasteItem(item.id, item.current_quantity)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition border border-transparent hover:border-rose-500/30 cursor-pointer"
                      title="Discard as waste"
                      aria-label="Discard as waste"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => claimItem(item.id, !item.claimed_by_name)}
                      className="p-1.5 text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                      title={item.claimed_by_name ? 'Unclaim' : 'Claim (this is mine!)'}
                      aria-label="Claim item"
                    >
                      <Bookmark className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. Top 3 Rescue Recipe Suggestions */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ChefHat className="w-5 h-5 text-emerald-400" />
            <h2 className="text-xl font-bold tracking-tight text-slate-100">Rescue Recipes</h2>
            <span className="text-xs text-slate-400">Ranked by at-risk ingredients used</span>
          </div>
        </div>

        {rescueRecipes.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-6 text-center text-sm text-slate-400">
            No recipe candidates found. Add items like eggs, onions, tomatoes, or chicken to unlock dinner ideas!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {rescueRecipes.map((recipe) => (
              <div
                key={recipe.id}
                className="flex flex-col justify-between rounded-xl border border-slate-700/70 bg-slate-800/60 p-5 shadow-lg hover:border-emerald-500/50 transition-all group"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-600/30">
                      {recipe.category} &bull; {recipe.prepTimeMinutes} mins
                    </span>
                    <span className="text-xs text-slate-400">{recipe.source === 'bundled_offline' ? 'Offline' : 'Online'}</span>
                  </div>

                  <h3 className="font-bold text-lg text-slate-100 group-hover:text-emerald-300 transition-colors mb-3">
                    {recipe.title}
                  </h3>

                  {/* Used Pantry Items */}
                  <div className="space-y-2 mb-4">
                    <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Using {recipe.pantryItemsUsedCount} pantry item(s):</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {recipe.usedPantryItems?.map((used: any) => (
                        <span
                          key={used.id}
                          className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-950/60 text-emerald-200 border border-emerald-600/30"
                        >
                          {used.name}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Missing Ingredients breakdown */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      <span>Missing {recipe.missingCount} ingredient(s):</span>
                    </div>
                    {recipe.missingCount === 0 ? (
                      <span className="text-xs font-semibold text-emerald-400">Ready to cook! All ingredients in pantry.</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {recipe.missingIngredients?.map((missing: any, idx: number) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-900 text-slate-400 border border-slate-700/60"
                          >
                            + {missing.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-700/60">
                  <button
                    onClick={() => onCookRecipe(recipe)}
                    className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 active:scale-98 text-white font-semibold text-sm rounded-lg shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Utensils className="w-4 h-4" />
                    <span>Cook This Dinner</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 4. Smart Shopping Hints Callout */}
      {shoppingHints.length > 0 && (
        <section className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-5 space-y-3">
          <div className="flex items-center gap-2 text-indigo-300 font-semibold text-sm sm:text-base">
            <ShoppingBag className="w-4 h-4" />
            <span>Smart Shopping Hints</span>
          </div>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Pick up these 1-2 complementary ingredients on your next grocery run to unlock multiple dinner recipes (never recommends items already in the house):
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {shoppingHints.map((hint, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-slate-900/80 border border-indigo-500/20 text-xs">
                <div>
                  <div className="font-bold text-slate-100 capitalize">{hint.ingredient}</div>
                  <div className="text-slate-400">Unlocks: {hint.recipes.join(', ')}</div>
                </div>
                <span className="px-2 py-1 rounded bg-indigo-500/20 text-indigo-300 font-bold shrink-0">
                  +{hint.unlocksRecipeCount} meal{hint.unlocksRecipeCount === 1 ? '' : 's'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
