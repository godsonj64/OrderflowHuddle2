import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Clock, Plus, Check } from 'lucide-react';
import { MenuItem, Modifier } from '../types';
import { useCart } from '../context/CartContext';

interface DishDetailsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  item: MenuItem | null;
  restaurantName: string;
}

export const DishDetailsDrawer: React.FC<DishDetailsDrawerProps> = ({ isOpen, onClose, item, restaurantName }) => {
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, Modifier[]>>({});
  const [added, setAdded] = useState(false);
  const { addToCart } = useCart();

  if (!item) return null;

  const toggleModifier = (modifier: Modifier) => {
    setSelectedModifiers(prev => {
      const current = prev[item.id] || [];
      const exists = current.find(m => m.id === modifier.id);
      if (exists) {
        return { ...prev, [item.id]: current.filter(m => m.id !== modifier.id) };
      } else {
        return { ...prev, [item.id]: [...current, modifier] };
      }
    });
  };

  const handleAddToCart = () => {
    const modifiers = selectedModifiers[item.id] || [];
    const modifiersPrice = modifiers.reduce((sum, m) => sum + m.price, 0);
    addToCart({ 
      itemId: item.id, 
      name: item.name, 
      price: item.basePrice + modifiersPrice, 
      quantity: 1,
      selectedModifiers: modifiers
    });
    
    setSelectedModifiers({});
    
    setAdded(true);
    setTimeout(() => {
      setAdded(false);
      onClose();
    }, 1000);
  };

  const currentModifiers = selectedModifiers[item.id] || [];
  const totalPrice = item.basePrice + currentModifiers.reduce((sum, m) => sum + m.price, 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10001]"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 max-h-[90vh] bg-white rounded-t-[20px] shadow-[0_-8px_30px_rgb(0,0,0,0.12)] z-[10002] flex flex-col md:max-w-xl md:mx-auto md:bottom-12 md:rounded-2xl md:shadow-2xl"
          >
            {item.imageUrl && (
              <div className="relative w-full h-48 sm:h-64 md:h-72 shrink-0">
                <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover rounded-t-[20px] md:rounded-t-2xl" />
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 p-2 bg-white/50 backdrop-blur-md hover:bg-white/80 rounded-full transition-colors z-10"
                >
                  <X size={20} className="text-black" />
                </button>
              </div>
            )}
            
            {!item.imageUrl && (
               <div className="flex items-center justify-between p-6 border-b border-gray-100 shrink-0">
                <h2 className="text-2xl font-bold font-sans">Item Details</h2>
                <button
                  onClick={onClose}
                  className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            )}

            <div className="overflow-y-auto p-6 flex flex-col gap-6 hide-scrollbar flex-grow">
              <div>
                <div className="flex justify-between items-start mb-2">
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-black leading-tight">{item.name}</h2>
                  <span className="text-xl sm:text-2xl font-extrabold text-black tracking-tight">${totalPrice.toFixed(2)}</span>
                </div>
                <p className="text-sm text-primary font-medium mb-3">{restaurantName}</p>
                {item.description && (
                  <p className="text-gray-600 text-sm sm:text-base leading-relaxed mb-4">
                    {item.description}
                  </p>
                )}
                
                <div className="flex items-center gap-4 border-y border-gray-100 py-3 mb-2">
                  {item.preparationTime && (
                    <div className="flex items-center gap-1.5 text-gray-500 text-sm font-medium">
                      <Clock size={16} /> 
                      <span>{item.preparationTime} mins</span>
                    </div>
                  )}
                  {item.preparationTime && item.calories && <span className="text-gray-300">•</span>}
                  {item.calories && (
                    <div className="flex items-center gap-1.5 text-gray-500 text-sm font-medium">
                      <span>{item.calories} kcal</span>
                    </div>
                  )}
                </div>
              </div>

              {item.modifierGroups && item.modifierGroups.length > 0 && (
                <div className="flex flex-col gap-6">
                  {item.modifierGroups.map(group => (
                    <div key={group.id} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                      <div className="flex items-baseline justify-between mb-3">
                        <h3 className="font-bold text-black text-lg">{group.name}</h3>
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{group.required ? 'Required' : 'Optional'}</span>
                      </div>
                      <div className="flex flex-col gap-2">
                        {group.modifiers.map(modifier => {
                          const isSelected = currentModifiers.some(m => m.id === modifier.id);
                          return (
                            <button
                              key={modifier.id}
                              onClick={() => toggleModifier(modifier)}
                              className={`flex justify-between items-center px-4 py-3 rounded-xl border transition-all ${
                                isSelected 
                                  ? 'bg-white border-black ring-1 ring-black shadow-sm' 
                                  : 'bg-white border-gray-200 hover:border-gray-300'
                              }`}
                            >
                              <span className={`font-medium ${isSelected ? 'text-black' : 'text-gray-700'}`}>{modifier.name}</span>
                              <span className={`font-semibold ${isSelected ? 'text-black' : 'text-gray-500'}`}>+${modifier.price.toFixed(2)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 sm:p-6 border-t border-gray-100 shrink-0 bg-white md:rounded-b-2xl">
              <button
                onClick={handleAddToCart}
                className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                  added 
                    ? 'bg-primary text-white scale-[0.98]' 
                    : 'bg-black text-white hover:bg-gray-800 active:bg-gray-900 shadow-lg shadow-black/20'
                }`}
              >
                {added ? (
                  <>
                    <Check size={24} />
                    Added to Cart
                  </>
                ) : (
                  <>
                    <Plus size={24} />
                    Add to Cart - ${totalPrice.toFixed(2)}
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
