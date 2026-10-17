import React, { useState } from 'react';
import { usePantry, PantryItem } from '../context/PantryContext.js';
import { useAuth } from '../context/AuthContext.js';
import { FreshnessBar } from './FreshnessBar.js';
import { cleanText, pluralize } from '../utils/text.js';
import {
  Search,
  Filter,
  Snowflake,
  Bookmark,
  Plus,
  Minus,
  Utensils,
  Trash2,
  PackageOpen,
  X,
} from 'lucide-react';

interface FridgeViewProps {
  onOpenAddItem: () => void;
}

export const FridgeView: React.FC<FridgeViewProps> = ({ onOpenAddItem }) => {
  const { currentHousehold } = useAuth();
  const { items, editItem, cookItem, wasteItem, claimItem } = usePantry();

  const [activeTab, setActiveTab] = useState<'all' | 'fridge' | 'freezer' | 'pantry' | 'leftovers'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'urgency' | 'expiry' | 'name'>('urgency');

  const isGuest = currentHousehold?.role === 'guest';

  // Filtering
  const filteredItems = items.filter(item => {
    if (activeTab === 'fridge' && item.location !== 'fridge') return false;
    if (activeTab === 'freezer' && item.location !== 'freezer') return false;
    if (activeTab === 'pantry' && item.location !== 'pantry') return false;
    if (activeTab === 'leftovers' && !item.is_leftover && item.category !== 'leftovers') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return (
        item.name.toLowerCase().includes(q) ||
        (item.notes && item.notes.toLowerCase().includes(q)) ||
        item.category.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Sorting
  filteredItems.sort((a, b) => {
    if (sortBy === 'urgency') return b.urgency.score - a.urgency.score;
    if (sortBy === 'expiry') {
      if (!a.expiry_date) return 1;
      if (!b.expiry_date) return -1;
      return a.expiry_date.localeCompare(b.expiry_date);
    }
    return a.name.localeCompare(b.name);
  });

  const handleDelta = async (item: PantryItem, delta: number) => {
    if (delta < 0 && item.current_quantity <= Math.abs(delta)) {
      await cookItem(item.id, item.current_quantity);
    } else {
      await editItem(item.id, { quantityDelta: delta, deltaReason: delta > 0 ? 'adjust' : 'cook' });
    }
  };

  const handleToggleFreeze = async (item: PantryItem) => {
    const willBeFrozen = !item.is_frozen;
    await editItem(item.id, {
      isFrozen: willBeFrozen,
      location: willBeFrozen ? 'freezer' : 'fridge',
    });
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Header controls: Search & Sort */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            placeholder="Search items, categories, notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl text-sm text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:border-stone-400 dark:focus:border-stone-600 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 p-0.5"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-stone-600 dark:text-stone-300 bg-stone-100 dark:bg-stone-900 px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-800">
            <Filter className="w-3.5 h-3.5 text-stone-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent text-stone-800 dark:text-stone-200 outline-none cursor-pointer text-xs"
              aria-label="Sort items"
            >
              <option value="urgency" className="bg-stone-100 dark:bg-stone-900">Sort: Expiring soonest</option>
              <option value="expiry" className="bg-stone-100 dark:bg-stone-900">Sort: Expiry date</option>
              <option value="name" className="bg-stone-100 dark:bg-stone-900">Sort: Name</option>
            </select>
          </div>
        </div>
      </div>

      {/* Location Filter Pills */}
      <div className="flex overflow-x-auto gap-1.5 pb-1 scrollbar-none" role="tablist" aria-label="Location filters">
        {[
          { id: 'all', label: 'All', count: items.length },
          { id: 'fridge', label: 'Fridge', count: items.filter(i => i.location === 'fridge').length },
          { id: 'freezer', label: 'Freezer', count: items.filter(i => i.location === 'freezer').length },
          { id: 'pantry', label: 'Pantry', count: items.filter(i => i.location === 'pantry').length },
          { id: 'leftovers', label: 'Leftovers', count: items.filter(i => i.is_leftover || i.category === 'leftovers').length },
        ].map((tab) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isSelected}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition flex items-center gap-1.5 cursor-pointer border ${
                isSelected
                  ? 'bg-stone-900 dark:bg-stone-100 text-stone-50 dark:text-stone-900 border-stone-900 dark:border-stone-100 font-semibold'
                  : 'bg-stone-100/70 dark:bg-stone-900/60 text-stone-600 dark:text-stone-400 border-stone-200 dark:border-stone-800 hover:text-stone-900 dark:hover:text-stone-100'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                isSelected
                  ? 'bg-stone-700 dark:bg-stone-300 text-stone-100 dark:text-stone-900'
                  : 'bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-400'
              }`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Item Grid */}
      {filteredItems.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/30 space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-400">
            <PackageOpen className="w-6 h-6 stroke-[1.5]" />
          </div>
          <h3 className="font-serif font-bold text-stone-800 dark:text-stone-200 text-base">
            {searchQuery ? 'No matching groceries' : 'No items here yet'}
          </h3>
          <p className="text-xs text-stone-500 max-w-sm mx-auto">
            {searchQuery
              ? `No items found matching "${searchQuery}".`
              : 'Add ingredients from your kitchen to begin keeping food fresh.'}
          </p>
          {!searchQuery && (
            <button
              onClick={onOpenAddItem}
              className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-stone-900 dark:bg-stone-100 text-stone-50 dark:text-stone-900 rounded-xl text-xs font-semibold hover:opacity-90 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add First Item</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredItems.map((item) => {
            const isLeftover = item.is_leftover || item.category === 'leftovers';

            return (
              <div
                key={item.id}
                className="group flex flex-col justify-between p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/70 hover:border-stone-300 dark:hover:border-stone-700 transition"
              >
                <div>
                  {/* Top row: name, tags */}
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="min-w-0">
                      <h4 className="font-semibold text-stone-900 dark:text-stone-100 truncate text-sm">
                        {cleanText(item.name)}
                      </h4>
                      <div className="flex items-center gap-1.5 text-[11px] text-stone-500 capitalize mt-0.5">
                        <span>{cleanText(item.category)}</span>
                        <span>&bull;</span>
                        <span>{cleanText(item.location)}</span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {isLeftover && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
                          Leftovers
                        </span>
                      )}
                      {item.is_frozen && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60 flex items-center gap-0.5">
                          <Snowflake className="w-2.5 h-2.5" />
                          <span>Frozen</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Freshness Bar */}
                  <div className="my-2.5">
                    <FreshnessBar daysRemaining={item.urgency.daysRemaining} />
                  </div>

                  {/* Claim tag */}
                  {item.claimed_by_name && (
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700 mt-1">
                      <Bookmark className="w-3 h-3 text-stone-400" />
                      <span>Claimed by {cleanText(item.claimed_by_name)}</span>
                    </div>
                  )}

                  {/* Notes */}
                  {item.notes && (
                    <p className="text-[11px] text-stone-400 italic line-clamp-1 mt-1">
                      {cleanText(item.notes)}
                    </p>
                  )}
                </div>

                {/* Bottom row: quantity stepper & actions */}
                <div className="mt-3.5 pt-2.5 border-t border-stone-100 dark:border-stone-800/80 flex items-center justify-between">
                  {/* Stepper */}
                  <div className="flex items-center gap-1.5 bg-stone-100 dark:bg-stone-800/70 px-2 py-1 rounded-lg border border-stone-200 dark:border-stone-700">
                    <button
                      onClick={() => handleDelta(item, -1)}
                      className="p-0.5 text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 transition cursor-pointer"
                      title="Reduce quantity by 1"
                      aria-label={`Reduce quantity of ${item.name}`}
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-xs font-semibold text-stone-800 dark:text-stone-200 min-w-12 text-center">
                      {item.current_quantity} {item.unit}
                    </span>
                    <button
                      onClick={() => handleDelta(item, 1)}
                      className="p-0.5 text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 transition cursor-pointer"
                      title="Add 1 more"
                      aria-label={`Increase quantity of ${item.name}`}
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleToggleFreeze(item)}
                      className={`p-1.5 rounded-lg border transition cursor-pointer ${
                        item.is_frozen
                          ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-800'
                          : 'text-stone-400 hover:text-sky-600 dark:hover:text-sky-400 border-transparent hover:bg-stone-100 dark:hover:bg-stone-800'
                      }`}
                      title={item.is_frozen ? 'Move back to fridge' : 'Freeze to preserve'}
                      aria-label="Toggle frozen state"
                    >
                      <Snowflake className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => claimItem(item.id, !item.claimed_by_name)}
                      className={`p-1.5 rounded-lg border transition cursor-pointer ${
                        item.claimed_by_name
                          ? 'bg-stone-200 dark:bg-stone-700 text-stone-800 dark:text-stone-200 border-stone-300 dark:border-stone-600'
                          : 'text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 border-transparent hover:bg-stone-100 dark:hover:bg-stone-800'
                      }`}
                      title={item.claimed_by_name ? 'Unclaim item' : 'Claim for me'}
                      aria-label="Claim item"
                    >
                      <Bookmark className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => cookItem(item.id, item.current_quantity)}
                      className="p-1.5 text-stone-500 hover:text-emerald-700 dark:hover:text-emerald-400 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border border-transparent hover:border-emerald-200 dark:hover:border-emerald-800/60 transition cursor-pointer"
                      title="Cook or use item (Counts as rescue)"
                      aria-label={`Use ${item.name}`}
                    >
                      <Utensils className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => wasteItem(item.id, item.current_quantity)}
                      className="p-1.5 text-stone-400 hover:text-tomato rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200 dark:hover:border-rose-900/60 transition cursor-pointer"
                      title="Discard (Record as waste)"
                      aria-label={`Discard ${item.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Add Button for Mobile & Quick Access */}
      <div className="fixed bottom-20 sm:bottom-8 right-6 z-30">
        <button
          onClick={onOpenAddItem}
          className="flex items-center gap-2 px-4 py-3 bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-white text-stone-50 dark:text-stone-950 rounded-full shadow-lg shadow-stone-900/15 dark:shadow-black/40 text-sm font-semibold transition active:scale-95 cursor-pointer"
          aria-label="Add item"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Add Item</span>
        </button>
      </div>
    </div>
  );
};
