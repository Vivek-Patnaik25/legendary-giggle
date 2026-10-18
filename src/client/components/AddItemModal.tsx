import React, { useState } from 'react';
import { usePantry } from '../context/PantryContext.js';
import { estimateExpiryDate } from '../../domain/expiry.js';
import { normaliseUnit } from '../../domain/units.js';
import { AccessibleModal } from './AccessibleModal.js';
import { cleanText, formatQuantityWithUnit } from '../utils/text.js';
import {
  Barcode,
  Calendar,
  Snowflake,
  Plus,
  Search,
  Sparkles,
  Check,
  X,
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
  const [category, setCategory] = useState('produce');
  const [location, setLocation] = useState<'fridge' | 'freezer' | 'pantry'>('fridge');
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState('piece');
  const [expiryDate, setExpiryDate] = useState(() => estimateExpiryDate('produce', 'fridge'));
  const [isLeftover, setIsLeftover] = useState(false);
  const [notes, setNotes] = useState('');

  // Barcode lookup
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [barcodeError, setBarcodeError] = useState('');

  const handleQuickAddPreset = async (p: typeof PRESETS[0]) => {
    const calculatedExpiry = estimateExpiryDate(p.category, p.location as any);
    await addItem({
      name: p.name,
      category: p.category,
      location: p.location,
      quantity: p.qty,
      unit: normaliseUnit(p.unit),
      expiryDate: calculatedExpiry,
      isLeftover: false,
      isFrozen: p.location === 'freezer',
      notes: '',
    });
    onClose();
  };

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

  const handleBarcodeLookup = async () => {
    if (!barcodeInput.trim()) return;

    setIsLookingUp(true);
    setBarcodeError('');

    try {
      const res = await fetch(`/api/lookup/barcode/${encodeURIComponent(barcodeInput.trim())}`);
      if (res.ok) {
        const data = await res.json();
        const p = data.product;
        if (p && p.found) {
          setName(p.name || `Product ${barcodeInput}`);
          setCategory(p.category || 'general');
          setExpiryDate(estimateExpiryDate(p.category, location));
          setActiveTab('manual');
        } else {
          setBarcodeError('Barcode not in local directory. Details can be entered manually.');
          setName(`Item ${barcodeInput}`);
          setActiveTab('manual');
        }
      } else {
        setBarcodeError('Barcode service unavailable. Enter details manually.');
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
    setName('');
    setCategory('produce');
    setLocation('fridge');
    setQuantity(1);
    setUnit('piece');
    setIsLeftover(false);
    setNotes('');
    setActiveTab('presets');
  };

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Groceries"
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-2 border-b border-stone-100 dark:border-stone-800">
          <h3 className="font-serif font-bold text-base sm:text-lg text-stone-900 dark:text-stone-100">
            Add to Fridge
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation tabs */}
        <div className="flex rounded-lg bg-stone-100 dark:bg-stone-900/80 p-1 border border-stone-200 dark:border-stone-800 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('presets')}
            className={`flex-1 py-1.5 rounded-md transition cursor-pointer ${
              activeTab === 'presets'
                ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-xs'
                : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200'
            }`}
          >
            Quick Presets
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`flex-1 py-1.5 rounded-md transition cursor-pointer ${
              activeTab === 'manual'
                ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-xs'
                : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200'
            }`}
          >
            Manual Entry
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('barcode')}
            className={`flex-1 py-1.5 rounded-md transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'barcode'
                ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-xs'
                : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200'
            }`}
          >
            <Barcode className="w-3.5 h-3.5" />
            <span>Barcode</span>
          </button>
        </div>

        {/* Tab 1: Presets */}
        {activeTab === 'presets' && (
          <div className="space-y-3">
            <p className="text-xs text-stone-600 dark:text-stone-400">
              Tap any staple to add it instantly to your fridge:
            </p>
            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
              {PRESETS.map((p, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-900/40 hover:border-stone-400 dark:hover:border-stone-600 text-left transition flex flex-col justify-between group"
                >
                  <div
                    onClick={() => handleQuickAddPreset(p)}
                    className="cursor-pointer"
                  >
                    <div className="font-semibold text-xs text-stone-900 dark:text-stone-100 group-hover:text-tomato transition-colors">
                      {p.name}
                    </div>
                    <div className="text-[11px] text-stone-600 dark:text-stone-400 mt-0.5 capitalize">
                      {formatQuantityWithUnit(p.qty, p.unit)} &bull; {p.location}
                    </div>
                  </div>
                  <div className="mt-2 pt-1.5 border-t border-stone-200/60 dark:border-stone-800/60 flex items-center justify-between text-[11px]">
                    <button
                      type="button"
                      onClick={() => handleQuickAddPreset(p)}
                      className="px-2 py-0.5 bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-white text-stone-50 dark:text-stone-950 font-semibold rounded-md shadow-2xs active:scale-95 cursor-pointer text-[10px]"
                    >
                      + Add
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectPreset(p)}
                      className="text-[10px] text-stone-500 hover:text-stone-900 dark:hover:text-stone-200 underline cursor-pointer"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-2 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={onClose}
                className="text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 cursor-pointer font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('manual')}
                className="text-stone-600 dark:text-stone-400 underline hover:text-stone-900 dark:hover:text-stone-100 cursor-pointer font-medium"
              >
                Or enter custom item name &rarr;
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Barcode */}
        {activeTab === 'barcode' && (
          <div className="space-y-3 py-2">
            <p className="text-xs text-stone-600 dark:text-stone-400">
              Scan or enter a product barcode:
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. 9300633852441"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleBarcodeLookup()}
                className="flex-1 px-3 py-2 text-xs bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl text-stone-900 dark:text-stone-100 outline-none"
              />
              <button
                type="button"
                disabled={isLookingUp}
                onClick={handleBarcodeLookup}
                className="px-3.5 py-2 bg-stone-900 dark:bg-stone-100 text-stone-50 dark:text-stone-900 text-xs font-semibold rounded-xl hover:opacity-90 transition cursor-pointer disabled:opacity-50"
              >
                {isLookingUp ? 'Looking up...' : 'Lookup'}
              </button>
            </div>

            {barcodeError && (
              <p className="text-[11px] text-tomato">{barcodeError}</p>
            )}

            <div className="pt-2 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={onClose}
                className="text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 cursor-pointer font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Tab 3: Manual Entry / Final confirmation form */}
        {activeTab === 'manual' && (
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                Item Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Baby Spinach, Greek Yogurt"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl text-stone-900 dark:text-stone-100 outline-none focus:border-stone-400 dark:focus:border-stone-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl text-stone-900 dark:text-stone-100 outline-none cursor-pointer"
                >
                  <option value="produce">Fresh Produce</option>
                  <option value="dairy">Dairy & Eggs</option>
                  <option value="meat">Meat & Seafood</option>
                  <option value="bakery">Bakery</option>
                  <option value="pantry_staple">Pantry Staples</option>
                  <option value="leftovers">Cooked Leftovers</option>
                  <option value="general">General</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Storage Location
                </label>
                <select
                  value={location}
                  onChange={(e) => handleLocationChange(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl text-stone-900 dark:text-stone-100 outline-none cursor-pointer"
                >
                  <option value="fridge">Fridge</option>
                  <option value="freezer">Freezer (Freezes timer)</option>
                  <option value="pantry">Pantry</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Quantity
                </label>
                <input
                  type="number"
                  min="0.1"
                  step="any"
                  value={quantity}
                  onChange={(e) => setQuantity(parseFloat(e.target.value) || 1)}
                  className="w-full px-3 py-2 text-xs bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl text-stone-900 dark:text-stone-100 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Unit
                </label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl text-stone-900 dark:text-stone-100 outline-none cursor-pointer"
                >
                  <option value="piece">pieces</option>
                  <option value="g">grams (g)</option>
                  <option value="kg">kg</option>
                  <option value="ml">ml</option>
                  <option value="l">litres (L)</option>
                  <option value="tin">tins / cans</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                Estimated Expiry Date
              </label>
              <input
                type="date"
                required
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl text-stone-900 dark:text-stone-100 outline-none"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="isLeftoverCheckbox"
                checked={isLeftover}
                onChange={(e) => handleToggleLeftover(e.target.checked)}
                className="rounded border-stone-300 text-stone-900 focus:ring-0 cursor-pointer"
              />
              <label htmlFor="isLeftoverCheckbox" className="text-xs text-stone-600 dark:text-stone-400 cursor-pointer select-none">
                This is a prepared leftover dish
              </label>
            </div>

            {/* Single Primary Action Button */}
            <div className="pt-3 border-t border-stone-100 dark:border-stone-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-white text-stone-50 dark:text-stone-950 font-semibold text-xs rounded-xl shadow-sm transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Add to Fridge</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </AccessibleModal>
  );
};
