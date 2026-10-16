import React, { useState } from 'react';
import { usePantry, PantryItem } from '../context/PantryContext.js';
import { useAuth } from '../context/AuthContext.js';
import {
  Search,
  Filter,
  Snowflake,
  Clock,
  Bookmark,
  Plus,
  Minus,
  Utensils,
  Trash2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';

interface PantryInventoryProps {
  onOpenAddItem: () => void;
}

export const PantryInventory: React.FC<PantryInventoryProps> = ({ onOpenAddItem }) => {
  const { currentHousehold } = useAuth();
  const { items, editItem, cookItem, wasteItem, deleteItem, claimItem } = usePantry();

  const [activeTab, setActiveTab] = useState<'all' | 'fridge' | 'freezer' | 'pantry' | 'leftovers'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'urgency' | 'expiry' | 'name'>('urgency');

  const isGuest = currentHousehold?.role === 'guest';

  // Filtering & Sorting
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

  filteredItems.sort((a, b) => {
    if (sortBy === 'urgency') return b.urgency.score - a.urgency.score;
    if (sortBy === 'expiry') {
      if (!a.expiry_date) return 1;
      if (!b.expiry_date) return -1;
      return a.expiry_date.localeCompare(b.expiry_date);
    }
    return a.name.localeCompare(b.name);
  });

  // Handle quantity delta modification (+1 or -1 unit)
  const handleDelta = async (item: PantryItem, delta: number) => {
    if (delta < 0 && item.current_quantity <= Math.abs(delta)) {
      // Cook / Rescue prompt
      await cookItem(item.id, item.current_quantity);
    } else {
      await editItem(item.id, { quantityDelta: delta, deltaReason: delta > 0 ? 'adjust' : 'cook' });
    }
  };

  // Toggle freeze mode
  const handleToggleFreeze = async (item: PantryItem) => {
    const willBeFrozen = !item.is_frozen;
    await editItem(item.id, {
      isFrozen: willBeFrozen,
      location: willBeFrozen ? 'freezer' : 'fridge',
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Search & Tabs Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search pantry items, notes, tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-800/80 border border-slate-700 rounded-xl text-sm text-slate-100 outline-none focus:border-emerald-500 transition"
          />
        </div>

        {/* Sort selector & Add Button */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800/80 px-3 py-2 rounded-xl border border-slate-700">
            <Filter className="w-3.5 h-3.5" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent text-slate-200 outline-none cursor-pointer"
            >
              <option value="urgency" className="bg-slate-800">Sort by Urgency</option>
              <option value="expiry" className="bg-slate-800">Sort by Expiry Date</option>
              <option value="name" className="bg-slate-800">Sort by Name</option>
            </select>
          </div>

          {!isGuest && (
            <button
              onClick={onOpenAddItem}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white text-sm font-semibold rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Add</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-none">
        {[
          { id: 'all', label: 'All Items', count: items.length },
          { id: 'fridge', label: 'Fridge', count: items.filter(i => i.location === 'fridge').length },
          { id: 'freezer', label: 'Freezer', count: items.filter(i => i.location === 'freezer').length },
          { id: 'pantry', label: 'Pantry Staples', count: items.filter(i => i.location === 'pantry').length },
          { id: 'leftovers', label: 'Leftovers', count: items.filter(i => i.is_leftover || i.category === 'leftovers').length },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center gap-2 border ${
              activeTab === tab.id
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <span>{tab.label}</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-900 text-[10px] text-slate-300 font-bold">
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Item List / Grid */}
      {filteredItems.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-slate-800 bg-slate-800/30 space-y-3">
          <AlertCircle className="w-8 h-8 text-slate-500 mx-auto" />
          <h3 className="font-semibold text-slate-300">No items found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {searchQuery
              ? `No items matching "${searchQuery}". Try a different keyword.`
              : 'This section is currently empty. Add groceries to begin tracking.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="flex flex-col justify-between p-4 rounded-xl border border-slate-700/70 bg-slate-800/70 shadow-md hover:border-slate-600 transition group"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h4 className="font-bold text-base text-slate-100 group-hover:text-emerald-300 transition-colors">
                      {item.name}
                    </h4>
                    <span className="text-[11px] text-slate-400 capitalize">
                      {item.category} &bull; {item.location}
                    </span>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${
                      item.urgency.tier === 'critical'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        : item.urgency.tier === 'high'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : item.urgency.tier === 'medium'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-slate-700/40 text-slate-400 border border-slate-600/40'
                    }`}
                  >
                    Urgency {item.urgency.score}
                  </span>
                </div>

                {/* Expiry Details */}
                <div className="flex items-center gap-1.5 text-xs text-slate-300 mb-2">
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{item.urgency.explanation}</span>
                </div>

                {/* Notes or Leftover indicator */}
                {item.is_leftover && (
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-950 text-cyan-300 border border-cyan-800/60 mb-2">
                    Cooked Leftovers
                  </span>
                )}

                {item.claimed_by_name && (
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-slate-900 text-indigo-300 border border-indigo-500/30 mb-2">
                    <Bookmark className="w-3 h-3" />
                    <span>Claimed by {item.claimed_by_name}</span>
                  </div>
                )}
              </div>

              {/* Quantity delta controls & actions */}
              <div className="mt-4 pt-3 border-t border-slate-700/60 flex items-center justify-between">
                {/* Quantity Controls */}
                <div className="flex items-center gap-2 bg-slate-900/80 px-2 py-1 rounded-lg border border-slate-700">
                  {!isGuest && (
                    <button
                      onClick={() => handleDelta(item, -1)}
                      className="p-1 hover:text-rose-400 text-slate-400 transition cursor-pointer"
                      title="Decrement quantity"
                      aria-label="Reduce quantity"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <span className="text-xs font-bold text-slate-100 min-w-10 text-center">
                    {item.current_quantity} {item.unit}
                  </span>
                  {!isGuest && (
                    <button
                      onClick={() => handleDelta(item, 1)}
                      className="p-1 hover:text-emerald-400 text-slate-400 transition cursor-pointer"
                      title="Increment quantity"
                      aria-label="Add quantity"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Quick Action Icons */}
                {!isGuest && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleToggleFreeze(item)}
                      className={`p-1.5 rounded-lg border transition cursor-pointer ${
                        item.is_frozen
                          ? 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40'
                          : 'text-slate-400 hover:text-cyan-300 border-transparent hover:bg-slate-700'
                      }`}
                      title={item.is_frozen ? 'Move back to fridge' : 'Freeze (extends expiry)'}
                      aria-label="Toggle freezer mode"
                    >
                      <Snowflake className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => claimItem(item.id, !item.claimed_by_name)}
                      className="p-1.5 text-slate-400 hover:text-indigo-300 rounded-lg hover:bg-slate-700 transition cursor-pointer"
                      title={item.claimed_by_name ? 'Unclaim item' : 'Claim this item'}
                      aria-label="Claim item"
                    >
                      <Bookmark className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => cookItem(item.id, item.current_quantity)}
                      className="p-1.5 text-slate-400 hover:text-emerald-300 rounded-lg hover:bg-slate-700 transition cursor-pointer"
                      title="Cook dinner with this (Rescue)"
                      aria-label="Cook item"
                    >
                      <Utensils className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => wasteItem(item.id, item.current_quantity)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-700 transition cursor-pointer"
                      title="Mark as waste"
                      aria-label="Mark item as waste"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
