import React, { useEffect, useState, useRef } from 'react';
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { MenuCategory, MenuItem } from '../types';
import { useAuth } from '../context/AuthContext';
import { Navigate, Link } from 'react-router-dom';
import { Plus, Edit2, Trash2, ArrowLeft, Image as ImageIcon, X } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { resizeAndConvertImage } from '../utils/imageUpload';

export const AdminMenu: React.FC = () => {
  const { userProfile, loading: authLoading } = useAuth();
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingItems, setLoadingItems] = useState(true);
  
  const [newCategory, setNewCategory] = useState<Partial<MenuCategory>>({ name: '', active: true, imageUrl: '' });
  const [newItem, setNewItem] = useState<Partial<MenuItem>>({ 
    name: '', 
    basePrice: 0, 
    active: true, 
    categoryId: '',
    imageUrl: '',
    preparationTime: 15,
    dietaryTags: [],
    modifierGroups: []
  });
  const categoryImageInputRef = useRef<HTMLInputElement>(null);
  const itemImageInputRef = useRef<HTMLInputElement>(null);

  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!userProfile || !['admin', 'restaurant_owner', 'manager'].includes(userProfile.role)) return;

    const unsubCategories = onSnapshot(query(collection(db, 'categories'), orderBy('displayOrder')), (snapshot) => {
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuCategory)));
      setLoadingCategories(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'categories'));

    const unsubItems = onSnapshot(collection(db, 'items'), (snapshot) => {
      setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem)));
      setLoadingItems(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'items'));

    return () => {
      unsubCategories();
      unsubItems();
    };
  }, [userProfile, authLoading]);

  if (authLoading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
      </div>
    );
  }

  if (!userProfile || !['admin', 'restaurant_owner', 'manager'].includes(userProfile.role)) {
    return <Navigate to="/" />;
  }

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategory.name?.trim()) return;
    try {
      await addDoc(collection(db, 'categories'), {
        name: newCategory.name,
        displayOrder: categories.length,
        active: true,
        imageUrl: newCategory.imageUrl || null
      });
      setNewCategory({ name: '', active: true, imageUrl: '' });
      if (categoryImageInputRef.current) categoryImageInputRef.current.value = '';
      setMessage({ type: 'success', text: 'Category added successfully!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to add category.' });
      handleFirestoreError(error, OperationType.CREATE, 'categories');
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name || !newItem.categoryId || newItem.basePrice === undefined || isNaN(newItem.basePrice)) return;
    try {
      const itemData: any = {
        ...newItem,
        basePrice: Number(newItem.basePrice),
        preparationTime: Number(newItem.preparationTime) || 15,
        active: true,
        modifierGroups: newItem.modifierGroups || []
      };
      if (itemData.calories && !isNaN(itemData.calories)) {
        itemData.calories = Number(itemData.calories);
      } else {
        delete itemData.calories;
      }

      await addDoc(collection(db, 'items'), itemData);
      setNewItem({ 
        name: '', 
        basePrice: 0, 
        active: true, 
        categoryId: categories[0]?.id || '',
        imageUrl: '',
        preparationTime: 15,
        dietaryTags: [],
        modifierGroups: []
      });
      if (itemImageInputRef.current) itemImageInputRef.current.value = '';
      setMessage({ type: 'success', text: 'Item added successfully!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to add item.' });
      handleFirestoreError(error, OperationType.CREATE, 'items');
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'category' | 'item') => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const base64Image = await resizeAndConvertImage(file, 800, 800);
      if (type === 'category') {
        setNewCategory(prev => ({ ...prev, imageUrl: base64Image }));
      } else {
        setNewItem(prev => ({ ...prev, imageUrl: base64Image }));
      }
    } catch (error) {
      console.error('Error processing image:', error);
      setMessage({ type: 'error', text: 'Failed to process image. Please try another one.' });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const toggleDietaryTag = (tag: 'vegan' | 'vegetarian' | 'gluten-free' | 'spicy') => {
    setNewItem(prev => {
      const tags = prev.dietaryTags || [];
      if (tags.includes(tag)) {
        return { ...prev, dietaryTags: tags.filter(t => t !== tag) };
      } else {
        return { ...prev, dietaryTags: [...tags, tag] };
      }
    });
  };

  const toggleCategoryActive = async (id: string, current: boolean) => {
    try {
      await updateDoc(doc(db, 'categories', id), { active: !current });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `categories/${id}`);
    }
  };

  const toggleItemActive = async (id: string, current: boolean) => {
    try {
      await updateDoc(doc(db, 'items', id), { active: !current });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `items/${id}`);
    }
  };

  const deleteCategory = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'categories', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `categories/${id}`);
    }
  };

  const deleteItem = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'items', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `items/${id}`);
    }
  };

  if (loadingCategories || loadingItems) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8">
      <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
        <Link to="/admin" className="p-2 sm:p-3 hover:bg-gray-100 rounded-2xl transition-colors bg-white shadow-ios-sm border border-gray-100">
          <ArrowLeft size={20} className="sm:w-6 sm:h-6" />
        </Link>
        <h1 className="text-3xl sm:text-4xl font-bold text-black">Menu Management</h1>
      </div>

      {message && (
        <div className={`p-4 rounded-2xl font-medium ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-10">
        {/* Categories Panel */}
        <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-ios-sm border border-gray-100 space-y-6 h-fit">
          <h2 className="text-2xl font-bold text-black">Categories</h2>
          
          <form onSubmit={handleAddCategory} className="flex flex-col gap-3">
            <div className="flex gap-2">
              <input 
                type="text" 
                value={newCategory.name}
                onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                placeholder="New Category Name"
                className="flex-grow border border-gray-200 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none"
                required
              />
              <button type="submit" className="bg-black text-[#EADDC5] p-3 rounded-2xl hover:bg-gray-900 transition-colors shadow-ios-sm">
                <Plus size={20} />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer bg-gray-50 hover:bg-gray-100 text-gray-700 px-4 py-3 rounded-2xl transition-colors border border-gray-200 w-full justify-center">
                <ImageIcon size={18} />
                <span className="text-sm font-medium">{newCategory.imageUrl ? 'Change Image' : 'Upload Image'}</span>
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  ref={categoryImageInputRef}
                  onChange={(e) => handleImageUpload(e, 'category')}
                />
              </label>
            </div>
            {newCategory.imageUrl && (
              <div className="relative w-full h-32 rounded-2xl overflow-hidden border border-gray-200">
                <img src={newCategory.imageUrl} alt="Category preview" className="w-full h-full object-cover" />
                <button 
                  type="button"
                  onClick={() => setNewCategory({ ...newCategory, imageUrl: '' })}
                  className="absolute top-2 right-2 p-1.5 bg-white rounded-xl shadow-ios-sm text-gray-500 hover:text-red-500"
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </form>

          <div className="space-y-2">
            {categories.map(category => (
              <div key={category.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl border border-gray-100">
                <div className="flex items-center gap-3">
                  {category.imageUrl ? (
                    <img src={category.imageUrl} alt={category.name} className="w-10 h-10 rounded-xl object-cover border border-gray-200" />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-gray-200 flex items-center justify-center text-gray-400">
                      <ImageIcon size={16} />
                    </div>
                  )}
                  <span className={`font-medium ${category.active ? 'text-black' : 'text-gray-400 line-through'}`}>
                    {category.name}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => toggleCategoryActive(category.id, category.active)} className="text-xs font-bold px-3 py-1.5 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-700 transition-colors">
                    {category.active ? 'Disable' : 'Enable'}
                  </button>
                  <button onClick={() => deleteCategory(category.id)} className="text-red-500 hover:text-red-700 p-1.5">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Items Panel */}
        <div className="lg:col-span-2 bg-white p-6 sm:p-8 rounded-[2rem] shadow-ios-sm border border-gray-100 space-y-6">
          <h2 className="text-2xl font-bold text-black">Menu Items</h2>

          <form onSubmit={handleAddItem} className="flex flex-col gap-4 bg-gray-50 p-4 sm:p-6 rounded-[2rem] border border-gray-100">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input 
                type="text" 
                value={newItem.name}
                onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                placeholder="Item Name"
                className="border border-gray-200 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none"
                required
              />
              <input 
                type="number" 
                step="0.01"
                value={newItem.basePrice || ''}
                onChange={(e) => setNewItem({...newItem, basePrice: parseFloat(e.target.value)})}
                placeholder="Price ($)"
                className="border border-gray-200 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none"
                required
              />
              <select 
                value={newItem.categoryId}
                onChange={(e) => setNewItem({...newItem, categoryId: e.target.value})}
                className="border border-gray-200 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none bg-white"
                required
              >
                <option value="" disabled>Select Category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input 
                type="number" 
                value={newItem.preparationTime || ''}
                onChange={(e) => setNewItem({...newItem, preparationTime: parseInt(e.target.value)})}
                placeholder="Prep Time (mins)"
                className="border border-gray-200 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none"
              />
              <input 
                type="number" 
                value={newItem.calories || ''}
                onChange={(e) => setNewItem({...newItem, calories: parseInt(e.target.value)})}
                placeholder="Calories"
                className="border border-gray-200 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none"
              />
              <input 
                type="text" 
                value={newItem.description || ''}
                onChange={(e) => setNewItem({...newItem, description: e.target.value})}
                placeholder="Description (optional)"
                className="border border-gray-200 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none md:col-span-1"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <label className="text-sm font-medium text-gray-700">Dietary Tags</label>
                <div className="flex flex-wrap gap-2">
                  {(['vegan', 'vegetarian', 'gluten-free', 'spicy'] as const).map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleDietaryTag(tag)}
                      className={`px-4 py-2 rounded-xl text-xs font-medium border transition-colors ${
                        newItem.dietaryTags?.includes(tag)
                          ? 'bg-black border-black text-[#EADDC5]'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {tag.charAt(0).toUpperCase() + tag.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-gray-700">Item Image</label>
                <label className="flex items-center gap-2 cursor-pointer bg-white hover:bg-gray-50 text-gray-700 px-4 py-3 rounded-2xl transition-colors border border-gray-200 w-full justify-center">
                  <ImageIcon size={18} />
                  <span className="text-sm font-medium">{newItem.imageUrl ? 'Change Image' : 'Upload Image'}</span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    ref={itemImageInputRef}
                    onChange={(e) => handleImageUpload(e, 'item')}
                  />
                </label>
                {newItem.imageUrl && (
                  <div className="relative w-full h-24 rounded-2xl overflow-hidden border border-gray-200 mt-2">
                    <img src={newItem.imageUrl} alt="Item preview" className="w-full h-full object-cover" />
                    <button 
                      type="button"
                      onClick={() => setNewItem({ ...newItem, imageUrl: '' })}
                      className="absolute top-2 right-2 p-1.5 bg-white rounded-xl shadow-ios-sm text-gray-500 hover:text-red-500"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-gray-200">
              <label className="text-sm font-medium text-gray-700">Modifiers (Coming Soon)</label>
              <p className="text-xs text-gray-500">Advanced modifier management is being updated.</p>
            </div>

            <button type="submit" className="w-full bg-black text-[#EADDC5] py-4 rounded-2xl font-medium hover:bg-gray-900 transition-colors flex items-center justify-center gap-2 mt-2 shadow-ios-sm">
              <Plus size={20} /> Add Item
            </button>
          </form>

          <div className="space-y-6">
            {categories.map(category => {
              const categoryItems = items.filter(i => i.categoryId === category.id);
              if (categoryItems.length === 0) return null;

              return (
                <div key={category.id} className="space-y-3">
                  <h3 className="font-bold text-black border-b border-gray-100 pb-2">{category.name}</h3>
                  <div className="grid grid-cols-1 gap-3">
                    {categoryItems.map(item => (
                      <div key={item.id} className="flex flex-col sm:flex-row sm:items-start justify-between p-4 bg-white rounded-2xl border border-gray-200 shadow-ios-sm gap-4">
                        <div className="flex gap-3 sm:gap-4 w-full">
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.name} className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover border border-gray-100 shrink-0" />
                          ) : (
                            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">
                              <ImageIcon size={20} />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <span className={`font-bold block text-base sm:text-lg truncate ${item.active ? 'text-black' : 'text-gray-400 line-through'}`}>
                              {item.name}
                            </span>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-black font-bold">${item.basePrice.toFixed(2)}</span>
                              {item.preparationTime && (
                                <span className="text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-xl whitespace-nowrap">
                                  {item.preparationTime} mins
                                </span>
                              )}
                            </div>
                            {item.description && (
                              <p className="text-xs sm:text-sm text-gray-500 mt-1.5 line-clamp-2">{item.description}</p>
                            )}
                            {item.dietaryTags && item.dietaryTags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {item.dietaryTags.map(tag => (
                                  <span key={tag} className="text-[10px] uppercase tracking-wider font-bold bg-gray-100 text-gray-600 px-2 py-1 rounded-md">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex sm:flex-col gap-2 shrink-0 w-full sm:w-auto justify-end border-t sm:border-t-0 border-gray-100 pt-3 sm:pt-0 mt-2 sm:mt-0">
                          <button onClick={() => toggleItemActive(item.id, item.active)} className="flex-1 sm:flex-none text-xs font-bold px-4 py-2 sm:py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors">
                            {item.active ? 'Disable' : 'Enable'}
                          </button>
                          <button onClick={() => deleteItem(item.id)} className="flex-1 sm:flex-none text-xs font-bold px-4 py-2 sm:py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 transition-colors">
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
