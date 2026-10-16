import React, { useState } from 'react';
import { usePantry } from '../context/PantryContext.js';
import { estimateExpiryDate } from '../../domain/expiry.js';
import { normaliseUnit } from '../../domain/units.js';
import {
  X,
  Barcode,
  Sparkles,
  Calendar,
  Layers,
  Snowflake,
  UtensilsCrossed,
  Check,
  Search,
  AlertCircle,
} from 'lucide-react';

interface AddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESETS = [
  { name: 'Fresh Milk', category: 'dairy', location: 'fridge', unit: 'l', qty: 1 },
  { name: 'Eggs', category: 'dairy', location: 'fridge', unit: 'piece', qty: 6 },
  { name: 'Sourdough Bread', category: 'bakery', location: 'pantry', unit: 'piece', qty: 1 },
  { name: 'Chicken Breast', category: 'meat', location: 'fridge', unit: 'g', qty: 500 },
  { name: 'Baby Spinach', category: 'produce', location: 'fridge', unit: 'g', qty: 150 },
  { name: 'Greek Yogurt', category: 'dairy', location: 'fridge', unit: 'piece', qty: 1 },
  { name: 'Brown Onion', category: 'produce', location: 'pantry', unit: 'piece', qty: 3 },
  { name: 'Bell Pepper', category: 'produce', location: 'fridge', unit: 'piece', qty: 2 },
  { name: 'Penne Pasta', category: 'pantry_staple', location: 'pantry', unit: 'g', qty: 500 },
  { name: 'Canned Tomatoes', category: 'pantry_staple', location: 'pantry', unit: 'tin', qty: 1 },
];

export const AddItemModal: React.FC<AddItemModalProps> = ({ isOpen, onClose }) => {
  const { addItem } = usePantry();

  const [activeTab, setActiveTab] = useState<'presets' | 'manual' | 'barcode'>('presets');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('general');
  const [location, setLocation] = useState<'fridge' | 'freezer' | 'pantry'>('fridge');
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState('piece');
  const [expiryDate, setExpiryDate] = useState(() => estimateExpiryDate('general', 'fridge'));
  const [isLeftover, setIsLeftover] = useState(false);
  const [notes, setNotes] = useState('');

  // Barcode lookup state
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [barcodeError, setBarcodeError] = useState('');

  if (!isOpen) return null;

  const handleSelectPreset = (p: typeof PRESETS[0]) => {
    setName(p.name);
    setCategory(p.category);
    setLocation(p.location as any);
    setUnit(p.unit);
    setQuantity(p.qty);
    setIsLeftover(false);
    setExpiryDate(estimateExpiryDate(p.category, p.location as any));
    setActiveTab('manual');
  };

  const handleCategoryChange = (newCat: string) => {
    setCategory(newCat);
    setExpiryDate(estimateExpiryDate(newCat, location));
  };

  const handleLocationChange = (newLoc: 'fridge' | 'freezer' | 'pantry') => {
    setLocation(newLoc);
    setExpiryDate(estimateExpiryDate(category, newLoc));
  };

  const handleToggleLeftover = (checked: boolean) => {
    setIsLeftover(checked);
    if (checked) {
      setCategory('leftovers');
      setExpiryDate(estimateExpiryDate('leftovers', location));
    }
  };

  const handleBarcodeLookup = async (codeToLookup?: string) => {
    const code = codeToLookup || barcodeInput;
    if (!code || code.trim().length === 0) return;

    setIsLookingUp(true);
    setBarcodeError('');

    try {
      const res = await fetch(`/api/lookup/barcode/${encodeURIComponent(code.trim())}`);
      if (res.ok) {
        const data = await res.json();
        const p = data.product;
        if (p && p.found) {
          setName(p.name || `Product ${code}`);
          setCategory(p.category || 'general');
          setExpiryDate(estimateExpiryDate(p.category, location));
          setActiveTab('manual');
        } else {
          setBarcodeError('Product barcode not found in database. Please enter details manually.');
          setName(`Item ${code}`);
          setActiveTab('manual');
        }
      } else {
        setBarcodeError('Barcode lookup offline. You can enter details manually.');
        setActiveTab('manual');
      }
    } catch {
      setBarcodeError('Barcode lookup network error. Entering manually.');
      setActiveTab('manual');
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    await addItem({
      name: name.trim(),
      category,
      location,
      quantity,
      unit: normaliseUnit(unit),
      expiryDate,
      isLeftover,
      isFrozen: location === 'freezer',
      notes,
    });

    onClose();
    // Reset form
    setName('');
    setCategory('general');
    setLocation('fridge');
    setQuantity(1);
    setUnit('piece');
    setIsLeftover(false);
    setNotes('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl p-6 text-slate-100 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-lg text-slate-100">Add to Pantry</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switchers */}
        <div className="flex rounded-lg bg-slate-800/80 p-1 my-4 border border-slate-700/60">
          <button
            type="button"
            onClick={() => setActiveTab('presets')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer ${
              activeTab === 'presets' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Quick Presets
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer ${
              activeTab === 'manual' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Manual Entry
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('barcode')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'barcode' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Barcode className="w-3.5 h-3.5" />
            <span>Barcode</span>
          </button>
        </div>

        {/* Tab 1: Presets */}
        {activeTab === 'presets' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-400">Tap common kitchen staples to add with smart defaults:</p>
            <div className="grid grid-cols-2 gap-2.5">
              {PRESETS.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectPreset(p)}
                  className="flex flex-col text-left p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-emerald-500/40 transition-all cursor-pointer group"
                >
                  <span className="font-semibold text-sm text-slate-100 group-hover:text-emerald-300">
                    {p.name}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {p.qty} {p.unit} &bull; {p.location}
                  </span>
                </button>
              ))}
            </div>
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setActiveTab('manual')}
                className="text-xs font-medium text-emerald-400 hover:text-emerald-300 cursor-pointer"
              >
                Or enter custom item &rarr;
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Barcode Lookup */}
        {activeTab === 'barcode' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-400">Scan or enter barcode number (cached, free Open Food Facts integration):</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. 3017620422003"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={() => handleBarcodeLookup()}
                disabled={isLookingUp}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold transition cursor-pointer"
              >
                {isLookingUp ? 'Searching...' : 'Lookup'}
              </button>
            </div>

            {/* Test Barcode Quick Buttons */}
            <div className="space-y-1 pt-2">
              <div className="text-[11px] text-slate-400 font-medium">Test Barcode Quick Presets:</div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => { setBarcodeInput('3017620422003'); handleBarcodeLookup('3017620422003'); }}
                  className="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
                >
                  Nutella (3017620422003)
                </button>
                <button
                  type="button"
                  onClick={() => { setBarcodeInput('5449000000996'); handleBarcodeLookup('5449000000996'); }}
                  className="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
                >
                  Coca Cola (5449000000996)
                </button>
              </div>
            </div>

            {barcodeError && (
              <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{barcodeError}</span>
              </div>
            )}
          </div>
        )}

        {/* Tab 3 / Form: Manual Entry */}
        {activeTab === 'manual' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Item Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Item Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Greek Yogurt, Cilantro, Chicken Thighs"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
              />
            </div>

            {/* Quantity and Unit */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Quantity</label>
                <input
                  type="number"
                  step="any"
                  min="0.1"
                  value={quantity}
                  onChange={(e) => setQuantity(parseFloat(e.target.value) || 1)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Unit</label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="piece">pieces / units</option>
                  <option value="g">grams (g)</option>
                  <option value="kg">kilograms (kg)</option>
                  <option value="ml">millilitres (ml)</option>
                  <option value="l">litres (l)</option>
                  <option value="cup">cups</option>
                  <option value="tin">tins / cans</option>
                  <option value="bunch">bunches</option>
                  <option value="portion">portions</option>
                </select>
              </div>
            </div>

            {/* Category and Storage Location */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500 cursor-pointer capitalize"
                >
                  <option value="general">General</option>
                  <option value="dairy">Dairy</option>
                  <option value="meat">Meat & Poultry</option>
                  <option value="seafood">Seafood</option>
                  <option value="produce">Fresh Produce</option>
                  <option value="bakery">Bakery / Bread</option>
                  <option value="leftovers">Cooked Leftovers</option>
                  <option value="pantry_staple">Pantry Staples</option>
                  <option value="condiments">Condiments</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Location</label>
                <select
                  value={location}
                  onChange={(e) => handleLocationChange(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500 cursor-pointer capitalize"
                >
                  <option value="fridge">Fridge</option>
                  <option value="freezer">Freezer</option>
                  <option value="pantry">Pantry / Cupboard</option>
                </select>
              </div>
            </div>

            {/* Expiry Date */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-300">
                  Estimated Expiry Date
                </label>
                <span className="text-[11px] text-emerald-400">Category smart estimate</span>
              </div>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
              />
            </div>

            {/* Leftover Flag */}
            <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-800/40 border border-slate-700/60">
              <input
                type="checkbox"
                id="isLeftoverCheckbox"
                checked={isLeftover}
                onChange={(e) => handleToggleLeftover(e.target.checked)}
                className="w-4 h-4 text-emerald-500 rounded bg-slate-800 border-slate-700 cursor-pointer"
              />
              <label htmlFor="isLeftoverCheckbox" className="text-xs text-slate-200 cursor-pointer">
                <strong>Cooked Leftovers</strong> (stored with short 3-day expiry)
              </label>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Notes (Optional)</label>
              <input
                type="text"
                placeholder="e.g. opened yesterday, for Wednesday stir-fry"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-100 rounded-lg transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 active:scale-98 text-white font-semibold text-sm rounded-lg shadow-sm transition flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Save to Pantry</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
