import React, { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { MenuCategory, MenuItem, RestaurantProfile, Modifier } from '../types';
import { useCart } from '../context/CartContext';
import { motion } from 'motion/react';
import { Plus, Info, Clock, Check } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { DishDetailsDrawer } from '../components/DishDetailsDrawer';

export const Home: React.FC = () => {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [profile, setProfile] = useState<RestaurantProfile | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, Modifier[]>>({});
  const [addedItems, setAddedItems] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDish, setSelectedDish] = useState<MenuItem | null>(null);
  const [showAllPopular, setShowAllPopular] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const { addToCart } = useCart();

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId]
    }));
  };

  useEffect(() => {
    let profileLoaded = false;
    let categoriesLoaded = false;
    let itemsLoaded = false;

    const checkLoading = () => {
      if (profileLoaded && categoriesLoaded && itemsLoaded) {
        setLoading(false);
      }
    };

    const unsubProfile = onSnapshot(doc(db, 'restaurant', 'profile'), (docSnap) => {
      if (docSnap.exists()) {
        setProfile(docSnap.data() as RestaurantProfile);
      }
      profileLoaded = true;
      checkLoading();
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'restaurant/profile');
      profileLoaded = true;
      checkLoading();
    });

    const unsubCategories = onSnapshot(query(collection(db, 'categories'), orderBy('displayOrder')), (snapshot) => {
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuCategory)));
      categoriesLoaded = true;
      checkLoading();
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'categories');
      categoriesLoaded = true;
      checkLoading();
    });

    const unsubItems = onSnapshot(collection(db, 'items'), (snapshot) => {
      setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem)));
      itemsLoaded = true;
      checkLoading();
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'items');
      itemsLoaded = true;
      checkLoading();
    });

    return () => {
      unsubProfile();
      unsubCategories();
      unsubItems();
    };
  }, []);

  const activeCategories = categories.filter(c => c.active);
  const activeItems = items.filter(i => {
    if (!i.active) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return i.name.toLowerCase().includes(query) || 
             (i.description && i.description.toLowerCase().includes(query));
    }
    return true;
  });

  const toggleModifier = (itemId: string, modifier: Modifier) => {
    setSelectedModifiers(prev => {
      const current = prev[itemId] || [];
      const exists = current.find(m => m.id === modifier.id);
      if (exists) {
        return { ...prev, [itemId]: current.filter(m => m.id !== modifier.id) };
      } else {
        return { ...prev, [itemId]: [...current, modifier] };
      }
    });
  };

  const handleAddToCart = (item: MenuItem) => {
    const modifiers = selectedModifiers[item.id] || [];
    const modifiersPrice = modifiers.reduce((sum, m) => sum + m.price, 0);
    addToCart({ 
      itemId: item.id, 
      name: item.name, 
      price: item.basePrice + modifiersPrice, 
      quantity: 1,
      selectedModifiers: modifiers
    });
    // Reset selection after adding
    setSelectedModifiers(prev => ({ ...prev, [item.id]: [] }));
    
    // Show added animation
    setAddedItems(prev => ({ ...prev, [item.id]: true }));
    setTimeout(() => {
      setAddedItems(prev => ({ ...prev, [item.id]: false }));
    }, 1500);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-stone-900"></div>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5 sm:space-y-8">
      {/* Search and Header area (Visual only for now but matches ref) */}
      <div className="flex sm:hidden flex-col gap-3 mt-2 mb-4">
        <div className="flex items-center gap-2">
          <div className="bg-white rounded-full flex-grow flex items-center px-4 py-2.5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-100">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input 
              type="text" 
              placeholder="Search..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none focus:outline-none text-sm w-full ml-3 placeholder-gray-400" 
            />
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <section className="relative rounded-[20px] overflow-hidden bg-black text-[#EADDC5] min-h-[140px] sm:min-h-[280px] flex items-center justify-center shadow-md">
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent z-10"></div>
        <img 
          src={profile?.bannerUrl || "https://picsum.photos/seed/restaurant/1920/1080?blur=1"} 
          alt="Restaurant Hero" 
          className="absolute inset-0 w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
        <div className="relative z-20 text-center p-4 max-w-3xl mx-auto mt-2 sm:mt-8">
          <h1 className="text-2xl sm:text-5xl md:text-7xl font-bold mb-1 sm:mb-2 tracking-tight text-white drop-shadow-md leading-tight">{profile?.name || 'Our Restaurant'}</h1>
          <div className="text-[9px] sm:text-xs md:text-sm font-medium text-gray-200 uppercase tracking-widest mb-2 sm:mb-6">Powered by OrderFlow</div>
          <p className="text-xs sm:text-lg text-gray-100 mb-4 sm:mb-8 font-sans font-medium max-w-xl mx-auto px-2 line-clamp-2 sm:line-clamp-none">{profile?.description || 'Fresh, delicious food delivered directly to you.'}</p>
          
          <div className="flex flex-wrap justify-center gap-2 text-[10px] sm:text-sm font-medium">
            {profile?.averageRating && (
              <span className="bg-white/20 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-full backdrop-blur-md flex items-center gap-1">
                <span className="text-[#F5A623]">★</span> {profile.averageRating.toFixed(1)}
                {profile.totalRatings && <span className="text-gray-200 text-[10px] sm:text-xs">({profile.totalRatings})</span>}
              </span>
            )}
            {profile?.isAcceptingOrders ? (
              <span className="bg-white/20 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-full backdrop-blur-md">
                Accepting Orders
              </span>
            ) : (
              <span className="bg-red-500/80 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-full backdrop-blur-md">
                 Currently Closed
              </span>
            )}
            {profile?.promotionalZeroFee && (
              <span className="bg-white/20 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-full backdrop-blur-md">
                 0% Service Fee Promo
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Marquee Section */}
      {profile?.isMarqueeEnabled && (profile.marqueeText || profile.marqueeImageUrl || (profile.marqueeImageUrls && profile.marqueeImageUrls.length > 0)) && (
        <div className="relative overflow-hidden rounded-[16px] border border-black/5 bg-[#1A1A1A]/95 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-xl h-12 sm:h-14 md:h-16 flex items-center">
          {/* Subtle inner highlight for iOS glass effect */}
          <div className="absolute inset-0 rounded-[16px] border border-white/10 pointer-events-none"></div>
          
          <div 
            className="flex items-center w-full h-full"
            style={{ WebkitMaskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)', maskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)' }}
          >
            <div className="animate-marquee flex items-center h-full min-w-max w-max">
              {/* Duplicate the exact same content group twice for seamless -50% translation */}
              {[...Array(2)].map((_, groupIndex) => (
                <div key={groupIndex} className="flex items-center h-full shrink-0">
                  {/* Repeat the actual items enough times to fill typical screen widths */}
                  {[...Array(10)].map((_, i) => (
                    <div key={i} className="flex items-center gap-12 pr-12 h-full shrink-0">
                      {profile.marqueeText && (
                        <span className="text-lg sm:text-xl md:text-2xl font-semibold tracking-[0.2em] bg-clip-text text-transparent bg-gradient-to-r from-[#EADDC5] to-[#B3A48A] whitespace-nowrap shrink-0">
                          {profile.marqueeText}
                        </span>
                      )}
                      {profile.marqueeImageUrls && profile.marqueeImageUrls.length > 0 ? (
                        profile.marqueeImageUrls.map((url, j) => (
                          <div key={j} className="h-full py-2 sm:py-2.5 flex items-center justify-center shrink-0">
                            <img src={url} alt={`Promo ${j}`} className="h-full w-auto object-contain drop-shadow-md rounded-xl shrink-0" />
                          </div>
                        ))
                      ) : profile.marqueeImageUrl && (
                        <div className="h-full py-2 sm:py-2.5 flex items-center justify-center shrink-0">
                          <img src={profile.marqueeImageUrl} alt="Promo" className="h-full w-auto object-contain drop-shadow-md rounded-xl shrink-0" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Categories Navigation */}
      {activeCategories.length > 0 && (
        <div className="sticky top-[64px] sm:top-[72px] z-40 bg-gray-50/95 backdrop-blur-xl py-2 sm:py-3 border-b border-gray-200/40 -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="flex overflow-x-auto pb-1 gap-2 sm:gap-3 hide-scrollbar">
            {activeCategories.map(category => {
              const hasItems = activeItems.some(item => item.categoryId === category.id);
              if (!hasItems) return null;
              return (
                <button
                  key={category.id}
                  onClick={() => {
                    document.getElementById(`category-${category.id}`)?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="whitespace-nowrap px-4 py-1.5 sm:px-5 sm:py-2.5 rounded-full bg-white text-black font-semibold text-xs sm:text-base hover:bg-black hover:text-white transition-all shadow-sm border border-gray-100 flex-shrink-0"
                >
                  {category.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Menu Section */}
      <div className="space-y-8 sm:space-y-12">
        {/* Popular Items Horizontal Scroll */}
        {activeItems.length > 0 && (
            <section className="-mx-4 px-4 sm:mx-0 sm:px-0 mt-4 sm:mt-6">
              <div className="flex items-center justify-between mb-3 sm:mb-6">
                <h2 className="text-lg sm:text-2xl font-extrabold text-black tracking-tight">Popular near you</h2>
                <button onClick={() => setShowAllPopular(!showAllPopular)} className="text-xs font-semibold text-gray-500">
                  {showAllPopular ? "View less" : "View all"}
                </button>
              </div>
              <div className="flex overflow-x-auto gap-3 sm:gap-4 hide-scrollbar pb-4 pl-1 pr-4 sm:pr-0">
                {[...activeItems].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, showAllPopular ? undefined : 5).map(item => (
                  <motion.div 
                    whileHover={{ y: -4, boxShadow: '0 12px 32px rgba(0, 0, 0, 0.08)' }}
                    key={`popular-${item.id}`} 
                    className="flex-none w-[160px] sm:w-[220px] bg-white rounded-[14px] shadow-sm border border-gray-100 flex flex-col group transition-all duration-300 relative overflow-hidden"
                  >
                    {/* Full-width Top Image */}
                    {item.imageUrl && (
                      <div 
                        onClick={() => setSelectedDish(item)}
                        className="w-full aspect-square bg-gray-50 flex items-center justify-center relative cursor-pointer"
                      >
                         {/* Heart Icon (Visual) */}
                         <button className="absolute top-3 right-3 text-white z-10 hover:scale-110 transition-transform bg-black/20 p-2 rounded-full backdrop-blur-sm">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                         </button>

                         {item.rating && (
                           <div className="absolute top-3 left-3 flex items-center gap-1 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-full shadow-sm">
                             <span className="text-[#F5A623]">★</span>
                             <span className="text-[10px] font-bold">{item.rating.toFixed(1)}</span>
                             {item.ratingCount && <span className="text-[8px] text-gray-500">({item.ratingCount})</span>}
                           </div>
                         )}
                        <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      </div>
                    )}
                    
                    <div className="flex-grow flex flex-col p-3 sm:p-4">
                      <h3 
                        onClick={() => setSelectedDish(item)}
                        className="text-[13px] sm:text-lg font-bold text-black leading-tight mb-1 cursor-pointer hover:underline truncate"
                      >
                        {item.name}
                      </h3>
                      <p className="text-[10px] sm:text-xs text-gray-400 font-medium mb-3 truncate">{profile?.name || 'Restaurant'}</p>
                      
                      <div className="flex items-center gap-1.5 mb-3">
                        {item.preparationTime && (
                           <span className="text-[9px] sm:text-[11px] text-gray-500 flex items-center gap-1 font-medium bg-gray-50 px-1.5 py-0.5 rounded-md">
                             <Clock size={10} /> {item.preparationTime}m
                           </span>
                        )}
                        {item.calories && (
                          <>
                            <span className="text-[9px] sm:text-[11px] text-gray-300">•</span>
                            <span className="text-[9px] sm:text-[11px] text-gray-500 font-medium">{item.calories} Cal</span>
                          </>
                        )}
                      </div>
                      
                      <div className="mt-auto flex justify-between items-end pt-2">
                         <span className="text-[14px] sm:text-lg font-extrabold text-black tracking-tight">${(item.basePrice + (selectedModifiers[item.id] || []).reduce((sum, m) => sum + m.price, 0)).toFixed(2)}</span>
                         <button
                            onClick={() => handleAddToCart(item)}
                            disabled={!profile?.isAcceptingOrders}
                            className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all shadow-md active:scale-90 ${
                              addedItems[item.id] 
                                ? 'bg-[#293429] text-white scale-[0.95]' 
                                : 'bg-[#1A211A] text-white hover:bg-black active:bg-gray-800'
                            }`}
                          >
                            {addedItems[item.id] ? <Check size={16} className="sm:hidden" /> : <Plus size={16} className="sm:hidden" />}
                            {addedItems[item.id] ? <Check size={20} className="hidden sm:block" /> : <Plus size={20} className="hidden sm:block" />}
                          </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </section>
        )}

        {activeCategories.map(category => {
          const categoryItems = activeItems.filter(item => item.categoryId === category.id);
          if (categoryItems.length === 0) return null;

          const isExpanded = expandedCategories[category.id];
          const displayedItems = isExpanded ? categoryItems : categoryItems.slice(0, 4);

          return (
            <section key={category.id} id={`category-${category.id}`} className="scroll-mt-24">
              <div className="flex items-center justify-between mb-3 sm:mb-6">
                <h2 className="text-lg sm:text-2xl font-extrabold text-black tracking-tight">{category.name}</h2>
                {categoryItems.length > 4 && (
                  <button onClick={() => toggleCategory(category.id)} className="text-xs font-semibold text-gray-500">
                    {isExpanded ? "View less" : "View all"}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {displayedItems.map(item => (
                  <motion.div 
                    whileHover={{ y: -4, boxShadow: '0 12px 32px rgba(0, 0, 0, 0.08)' }}
                    key={item.id} 
                    className="bg-white rounded-[14px] shadow-sm border border-gray-100 flex flex-col group transition-all duration-300 relative h-full overflow-hidden"
                  >
                    {/* Full-width Top Image */}
                    {item.imageUrl && (
                      <div 
                        onClick={() => setSelectedDish(item)}
                        className="w-full aspect-square bg-gray-50 flex items-center justify-center relative cursor-pointer"
                      >
                         {/* Heart Icon (Visual) */}
                         <button className="absolute top-3 right-3 text-white z-10 hover:scale-110 transition-transform bg-black/20 p-2 rounded-full backdrop-blur-sm">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                         </button>

                         {item.rating && (
                           <div className="absolute top-3 left-3 flex items-center gap-1 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-full shadow-sm">
                             <span className="text-[#F5A623]">★</span>
                             <span className="text-[10px] font-bold">{item.rating.toFixed(1)}</span>
                             {item.ratingCount && <span className="text-[8px] text-gray-500">({item.ratingCount})</span>}
                           </div>
                         )}
                        <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      </div>
                    )}
                    
                    <div className="flex-grow flex flex-col p-3 sm:p-4">
                      <h3 
                        onClick={() => setSelectedDish(item)}
                        className="text-[13px] sm:text-lg font-bold text-black leading-tight mb-1 cursor-pointer hover:underline"
                      >
                        {item.name}
                      </h3>
                      <p className="text-[10px] sm:text-xs text-gray-400 font-medium mb-3">{profile?.name || 'Restaurant'}</p>
                      
                      <div className="flex items-center gap-1.5 mb-3">
                        {item.preparationTime && (
                           <span className="text-[9px] sm:text-[11px] text-gray-500 flex items-center gap-1 font-medium bg-gray-50 px-1.5 py-0.5 rounded-md">
                             <Clock size={10} /> {item.preparationTime} min
                           </span>
                        )}
                        {item.calories && (
                          <>
                            <span className="text-[9px] sm:text-[11px] text-gray-300">•</span>
                            <span className="text-[9px] sm:text-[11px] text-gray-500 font-medium">{item.calories} Cal</span>
                          </>
                        )}
                      </div>

                      {/* We keep modifiers rendering but smaller */}
                      {item.modifierGroups && item.modifierGroups.length > 0 && (
                        <div className="mb-3 flex-grow">
                          {item.modifierGroups.map(group => (
                            <div key={group.id} className="mb-2">
                              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">{group.name} {group.required ? '(Required)' : ''}</p>
                              <div className="flex flex-wrap gap-1">
                                {group.modifiers.map(modifier => {
                                  const isSelected = (selectedModifiers[item.id] || []).some(m => m.id === modifier.id);
                                  return (
                                    <button
                                      key={modifier.id}
                                      onClick={() => toggleModifier(item.id, modifier)}
                                      className={`text-[9px] px-2 py-1 rounded-md border transition-colors ${
                                        isSelected 
                                          ? 'bg-black text-white border-black' 
                                          : 'bg-white text-gray-500 border-gray-200'
                                      }`}
                                    >
                                      {modifier.name} (+${modifier.price.toFixed(2)})
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      <div className="mt-auto flex justify-between items-end pt-2">
                         <span className="text-[14px] sm:text-lg font-extrabold text-black tracking-tight">${(item.basePrice + (selectedModifiers[item.id] || []).reduce((sum, m) => sum + m.price, 0)).toFixed(2)}</span>
                         <button
                            onClick={() => handleAddToCart(item)}
                            disabled={!profile?.isAcceptingOrders}
                            className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all shadow-md active:scale-90 ${
                              addedItems[item.id] 
                                ? 'bg-[#293429] text-white scale-[0.95]' 
                                : 'bg-[#1A211A] text-white hover:bg-black active:bg-gray-800'
                            }`}
                          >
                            {addedItems[item.id] ? <Check size={16} className="sm:hidden" /> : <Plus size={16} className="sm:hidden" />}
                            {addedItems[item.id] ? <Check size={20} className="hidden sm:block" /> : <Plus size={20} className="hidden sm:block" />}
                          </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* Photo Gallery Section */}
      {profile?.isGalleryEnabled && profile.galleryImageUrls && profile.galleryImageUrls.length > 0 && (
        <section className="pt-6 sm:pt-10 pb-0 overflow-hidden w-[100vw] relative left-[50%] right-[50%] -ml-[50vw] -mr-[50vw]">
          <div className="mb-4 sm:mb-6 px-4 sm:px-8 max-w-7xl mx-auto">
            <h2 className="text-lg sm:text-2xl font-extrabold text-black tracking-tight mb-1">Spotlight</h2>
            <p className="text-gray-500 text-sm sm:text-base max-w-sm">Discover our latest highlights and exclusive offers.</p>
          </div>
          
          <div className="relative flex items-center h-[230px] sm:h-[340px] md:h-[440px]">
            
            <div className="animate-gallery-marquee flex items-center h-full min-w-max w-max py-4 sm:py-8">
              {[...Array(2)].map((_, groupIndex) => (
                <div key={groupIndex} className="flex items-center h-full shrink-0">
                  {/* Repeat the gallery items multiple times per group to ensure it's wide enough */}
                  {[...Array(6)].map((_, repeatIndex) => (
                    <React.Fragment key={repeatIndex}>
                      {profile.galleryImageUrls?.map((url, j) => (
                        <div key={`${repeatIndex}-${j}`} className="h-full w-[250px] sm:w-[400px] md:w-[500px] flex items-center justify-center shrink-0 pr-2 sm:pr-3">
                          <img src={url} alt={`Gallery ${j}`} className="h-full w-full object-cover rounded-[16px] shadow-[0_8px_30px_rgb(0,0,0,0.08)] shrink-0" />
                        </div>
                      ))}
                    </React.Fragment>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <DishDetailsDrawer 
        isOpen={!!selectedDish} 
        onClose={() => setSelectedDish(null)} 
        item={selectedDish} 
        restaurantName={profile?.name || 'Restaurant'} 
      />
    </motion.div>
  );
};
