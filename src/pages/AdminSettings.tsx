import React, { useEffect, useState } from 'react';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { RestaurantProfile } from '../types';
import { useAuth } from '../context/AuthContext';
import { Navigate, Link } from 'react-router-dom';
import { ArrowLeft, Save, Upload, Image as ImageIcon, X } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { resizeAndConvertImage } from '../utils/imageUpload';

export const AdminSettings: React.FC = () => {
  const { userProfile, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<RestaurantProfile>({
    name: '',
    isAcceptingOrders: false,
    description: '',
    address: '',
    phone: '',
    deliveryFee: 0,
    minimumOrder: 0,
    promotionalZeroFee: false,
    taxRate: 0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!userProfile || !['admin', 'restaurant_owner', 'manager'].includes(userProfile.role)) return;

    const fetchProfile = async () => {
      try {
        const docRef = doc(db, 'restaurant', 'profile');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setProfile(docSnap.data() as RestaurantProfile);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'restaurant/profile');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const docRef = doc(db, 'restaurant', 'profile');
      const docSnap = await getDoc(docRef);
      
      const cleanProfile = JSON.parse(JSON.stringify(profile));

      if (docSnap.exists()) {
        await updateDoc(docRef, cleanProfile);
      } else {
        await setDoc(docRef, cleanProfile);
      }
      setMessage({ type: 'success', text: 'Settings saved successfully!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save settings.' });
      handleFirestoreError(error, OperationType.UPDATE, 'restaurant/profile');
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'logoUrl' | 'bannerUrl' | 'marqueeImageUrl') => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const width = field === 'bannerUrl' ? 1920 : (field === 'marqueeImageUrl' ? 800 : 400);
      const height = field === 'bannerUrl' ? 1080 : (field === 'marqueeImageUrl' ? 200 : 400);
      const base64 = await resizeAndConvertImage(file, width, height);
      setProfile(prev => ({ ...prev, [field]: base64 }));
    } catch (error) {
      console.error('Error uploading image', error);
      setMessage({ type: 'error', text: 'Failed to process image.' });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleMarqueeImagesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    try {
      const newImages = [...(profile.marqueeImageUrls || [])];
      for (let i = 0; i < files.length; i++) {
        const base64 = await resizeAndConvertImage(files[i], 800, 400);
        newImages.push(base64);
      }
      setProfile(prev => ({ ...prev, marqueeImageUrls: newImages }));
    } catch (error) {
      console.error('Error uploading marquee images', error);
      setMessage({ type: 'error', text: 'Failed to process images.' });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleGalleryImagesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    try {
      const newImages = [...(profile.galleryImageUrls || [])];
      for (let i = 0; i < files.length; i++) {
        const base64 = await resizeAndConvertImage(files[i], 1200, 800); // larger for gallery
        newImages.push(base64);
      }
      setProfile(prev => ({ ...prev, galleryImageUrls: newImages }));
    } catch (error) {
      console.error('Error uploading gallery images', error);
      setMessage({ type: 'error', text: 'Failed to process images.' });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const removeMarqueeImage = (index: number) => {
    const newImages = [...(profile.marqueeImageUrls || [])];
    newImages.splice(index, 1);
    setProfile(prev => ({ ...prev, marqueeImageUrls: newImages }));
  };

  const removeGalleryImage = (index: number) => {
    const newImages = [...(profile.galleryImageUrls || [])];
    newImages.splice(index, 1);
    setProfile(prev => ({ ...prev, galleryImageUrls: newImages }));
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center gap-4 mb-8">
        <Link to="/admin" className="p-3 hover:bg-gray-200 rounded-2xl transition-colors bg-white shadow-ios-sm border border-gray-100">
          <ArrowLeft size={24} />
        </Link>
        <h1 className="text-4xl font-bold text-black">Admin Settings</h1>
      </div>

      {message && (
        <div className={`p-4 rounded-2xl font-medium ${message.type === 'success' ? 'bg-gray-100 text-black border border-gray-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSave} className="bg-white p-6 sm:p-10 rounded-[2rem] shadow-ios-sm border border-gray-100 space-y-8">
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-black border-b border-gray-100 pb-4">Branding & Images</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="font-medium text-black block text-sm">Store Logo</label>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div className="w-24 h-24 bg-gray-100 rounded-2xl border border-gray-200 flex items-center justify-center overflow-hidden shrink-0">
                    {profile.logoUrl ? <img src={profile.logoUrl} alt="Logo" className="w-full h-full object-cover" /> : <ImageIcon className="text-gray-400" size={32} />}
                  </div>
                  <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-2xl font-medium transition-colors flex items-center gap-2 text-sm sm:text-base">
                    <Upload size={18} /> Upload Logo
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'logoUrl')} />
                  </label>
                </div>
              </div>
              <div className="space-y-2">
                <label className="font-medium text-black block text-sm">Hero Banner</label>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div className="w-full sm:w-40 h-32 sm:h-24 bg-gray-100 rounded-2xl border border-gray-200 flex items-center justify-center overflow-hidden shrink-0">
                    {profile.bannerUrl ? <img src={profile.bannerUrl} alt="Banner" className="w-full h-full object-cover" /> : <ImageIcon className="text-gray-400" size={32} />}
                  </div>
                  <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-2xl font-medium transition-colors flex items-center gap-2 text-sm sm:text-base">
                    <Upload size={18} /> Upload Banner
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'bannerUrl')} />
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-black border-b border-gray-100 pb-4">Basic Information</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="font-medium text-black block text-sm">Restaurant Name</label>
                <input 
                  type="text" 
                  value={profile.name}
                  onChange={(e) => setProfile({...profile, name: e.target.value})}
                  className="w-full border border-gray-200 rounded-2xl p-3 focus:ring-2 focus:ring-black focus:border-black outline-none"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="font-medium text-black block text-sm">Phone Number</label>
                <input 
                  type="tel" 
                  value={profile.phone || ''}
                  onChange={(e) => setProfile({...profile, phone: e.target.value})}
                  className="w-full border border-gray-200 rounded-2xl p-3 focus:ring-2 focus:ring-black focus:border-black outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="font-medium text-black block text-sm">Email Address</label>
                <input 
                  type="email" 
                  value={profile.email || ''}
                  onChange={(e) => setProfile({...profile, email: e.target.value})}
                  className="w-full border border-gray-200 rounded-2xl p-3 focus:ring-2 focus:ring-black focus:border-black outline-none"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="font-medium text-black block text-sm">Description</label>
                <textarea 
                  value={profile.description || ''}
                  onChange={(e) => setProfile({...profile, description: e.target.value})}
                  className="w-full border border-gray-200 rounded-2xl p-3 focus:ring-2 focus:ring-black focus:border-black outline-none resize-none h-24"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="font-medium text-black block text-sm">Address</label>
                <input 
                  type="text" 
                  value={profile.address || ''}
                  onChange={(e) => setProfile({...profile, address: e.target.value})}
                  className="w-full border border-gray-200 rounded-2xl p-3 focus:ring-2 focus:ring-black focus:border-black outline-none"
                />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-black border-b border-gray-100 pb-4">Operations & Delivery</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="font-medium text-black block text-sm">Delivery Fee ($)</label>
                <input 
                  type="number" 
                  step="0.01"
                  min="0"
                  value={profile.deliveryFee || 0}
                  onChange={(e) => setProfile({...profile, deliveryFee: parseFloat(e.target.value)})}
                  className="w-full border border-gray-200 rounded-2xl p-3 focus:ring-2 focus:ring-black focus:border-black outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="font-medium text-black block text-sm">Minimum Order ($)</label>
                <input 
                  type="number" 
                  step="0.01"
                  min="0"
                  value={profile.minimumOrder || 0}
                  onChange={(e) => setProfile({...profile, minimumOrder: parseFloat(e.target.value)})}
                  className="w-full border border-gray-200 rounded-2xl p-3 focus:ring-2 focus:ring-black focus:border-black outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="font-medium text-black block text-sm">Tax Rate (%)</label>
                <input 
                  type="number" 
                  step="0.01"
                  min="0"
                  value={profile.taxRate || 0}
                  onChange={(e) => setProfile({...profile, taxRate: parseFloat(e.target.value)})}
                  className="w-full border border-gray-200 rounded-2xl p-3 focus:ring-2 focus:ring-black focus:border-black outline-none"
                />
              </div>
              
              <div className="md:col-span-3 flex flex-col gap-4 bg-gray-50 p-6 rounded-[2rem] border border-gray-100">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={profile.isAcceptingOrders}
                    onChange={(e) => setProfile({...profile, isAcceptingOrders: e.target.checked})}
                    className="w-5 h-5 text-black rounded focus:ring-black"
                  />
                  <div>
                    <span className="font-bold text-black block">Accepting Orders</span>
                    <span className="text-sm text-gray-500">Turn this off to temporarily pause all incoming orders.</span>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={profile.isDeliveryEnabled ?? true}
                    onChange={(e) => setProfile({...profile, isDeliveryEnabled: e.target.checked})}
                    className="w-5 h-5 text-black rounded focus:ring-black"
                  />
                  <div>
                    <span className="font-bold text-black block">Enable Delivery</span>
                    <span className="text-sm text-gray-500">Allow customers to place delivery orders.</span>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={profile.isPickupEnabled ?? true}
                    onChange={(e) => setProfile({...profile, isPickupEnabled: e.target.checked})}
                    className="w-5 h-5 text-black rounded focus:ring-black"
                  />
                  <div>
                    <span className="font-bold text-black block">Enable Pickup</span>
                    <span className="text-sm text-gray-500">Allow customers to place pickup orders.</span>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={profile.isSchedulePickupEnabled ?? false}
                    onChange={(e) => setProfile({...profile, isSchedulePickupEnabled: e.target.checked})}
                    className="w-5 h-5 text-black rounded focus:ring-black"
                  />
                  <div>
                    <span className="font-bold text-black block">Enable Scheduled Pickup</span>
                    <span className="text-sm text-gray-500">Allow customers to schedule their pickup time in advance.</span>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={profile.promotionalZeroFee || false}
                    onChange={(e) => setProfile({...profile, promotionalZeroFee: e.target.checked})}
                    className="w-5 h-5 text-black rounded focus:ring-black"
                  />
                  <div>
                    <span className="font-bold text-black block">Promotional Zero Service Fee</span>
                    <span className="text-sm text-gray-500">Enable the 6-month promotional 0% service fee for customers.</span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-black border-b border-gray-100 pb-4">Business Hours</h2>
            <div className="grid grid-cols-1 gap-4">
              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => {
                const hours = profile.businessHours?.[day] || { open: '09:00', close: '17:00', closed: false };
                return (
                  <div key={day} className="flex flex-col bg-gray-50 p-3 sm:p-4 rounded-2xl border border-gray-100">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <input 
                          type="checkbox" 
                          checked={!hours.closed}
                          onChange={(e) => {
                            const newHours = { ...profile.businessHours, [day]: { ...hours, closed: !e.target.checked } };
                            setProfile({ ...profile, businessHours: newHours });
                          }}
                          className="w-5 h-5 text-black rounded focus:ring-black shrink-0"
                        />
                        <span className="font-bold text-black w-24 shrink-0">{day}</span>
                      </div>
                      {!hours.closed && (
                        <div className="flex items-center gap-2 pl-8 sm:pl-0 flex-wrap">
                          <input 
                            type="time" 
                            value={hours.open}
                            onChange={(e) => {
                              const newHours = { ...profile.businessHours, [day]: { ...hours, open: e.target.value } };
                              setProfile({ ...profile, businessHours: newHours });
                            }}
                            className="border border-gray-200 rounded-xl p-2 focus:ring-2 focus:ring-black focus:border-black outline-none text-sm w-fit min-w-[100px]"
                          />
                          <span className="text-gray-500 shrink-0">to</span>
                          <input 
                            type="time" 
                            value={hours.close}
                            onChange={(e) => {
                              const newHours = { ...profile.businessHours, [day]: { ...hours, close: e.target.value } };
                              setProfile({ ...profile, businessHours: newHours });
                            }}
                            className="border border-gray-200 rounded-xl p-2 focus:ring-2 focus:ring-black focus:border-black outline-none text-sm w-fit min-w-[100px]"
                          />
                        </div>
                      )}
                      {hours.closed && <span className="text-gray-500 text-sm italic pl-8 sm:pl-0">Closed</span>}
                    </div>
                    
                    {!hours.closed && (
                      <div className="mt-3 pl-8">
                        <label className="flex items-start sm:items-center gap-2 text-sm text-gray-600 mb-2 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={hours.hasSecondSlot || false}
                            onChange={(e) => {
                              const newHours = { ...profile.businessHours, [day]: { ...hours, hasSecondSlot: e.target.checked, open2: hours.open2 || '17:00', close2: hours.close2 || '22:00' } };
                              setProfile({ ...profile, businessHours: newHours });
                            }}
                            className="w-4 h-4 text-black rounded focus:ring-black mt-0.5 sm:mt-0 shrink-0"
                          />
                          <span className="leading-tight">Add second shift (e.g. Dinner)</span>
                        </label>
                        {hours.hasSecondSlot && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <input 
                              type="time" 
                              value={hours.open2 || '17:00'}
                              onChange={(e) => {
                                const newHours = { ...profile.businessHours, [day]: { ...hours, open2: e.target.value } };
                                setProfile({ ...profile, businessHours: newHours });
                              }}
                              className="border border-gray-200 rounded-xl p-2 focus:ring-2 focus:ring-black focus:border-black outline-none text-sm w-fit min-w-[100px]"
                            />
                            <span className="text-gray-500 shrink-0">to</span>
                            <input 
                              type="time" 
                              value={hours.close2 || '22:00'}
                              onChange={(e) => {
                                const newHours = { ...profile.businessHours, [day]: { ...hours, close2: e.target.value } };
                                setProfile({ ...profile, businessHours: newHours });
                              }}
                              className="border border-gray-200 rounded-xl p-2 focus:ring-2 focus:ring-black focus:border-black outline-none text-sm w-fit min-w-[100px]"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-black border-b border-gray-100 pb-4">Promotional Marquee</h2>
            <div className="space-y-6">
              <label className="flex items-center gap-3 cursor-pointer bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <input 
                  type="checkbox" 
                  checked={profile.isMarqueeEnabled || false}
                  onChange={(e) => setProfile({...profile, isMarqueeEnabled: e.target.checked})}
                  className="w-5 h-5 text-black rounded focus:ring-black"
                />
                <div>
                  <span className="font-bold text-black block">Enable Marquee</span>
                  <span className="text-sm text-gray-500">Show a scrolling promotional banner below the main hero image.</span>
                </div>
              </label>

              {profile.isMarqueeEnabled && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="font-medium text-black block text-sm">Marquee Text</label>
                    <input 
                      type="text" 
                      value={profile.marqueeText || ''}
                      onChange={(e) => setProfile({...profile, marqueeText: e.target.value})}
                      placeholder="e.g., 20% OFF ALL ORDERS THIS WEEKEND!"
                      className="w-full border border-gray-200 rounded-2xl p-3 focus:ring-2 focus:ring-black focus:border-black outline-none"
                    />
                  </div>
                  <div className="space-y-4 md:col-span-2">
                    <label className="font-medium text-black block text-sm">Marquee Images (Optional)</label>
                    <div className="flex flex-wrap gap-4 items-start">
                      {profile.marqueeImageUrls?.map((url, i) => (
                        <div key={i} className="w-24 h-12 bg-gray-100 rounded-xl border border-gray-200 flex items-center justify-center overflow-hidden relative group">
                          <img src={url} alt={`Marquee ${i + 1}`} className="w-full h-full object-contain p-1" />
                          <button 
                            type="button"
                            onClick={() => removeMarqueeImage(i)}
                            className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                      {/* Backward compatibility for single marquee image */}
                      {profile.marqueeImageUrl && !profile.marqueeImageUrls?.length && (
                         <div className="w-24 h-12 bg-gray-100 rounded-xl border border-gray-200 flex items-center justify-center overflow-hidden shrink-0 relative group">
                          <img src={profile.marqueeImageUrl} alt="Marquee" className="w-full h-full object-cover" />
                          <button 
                            type="button"
                            className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => setProfile(prev => ({ ...prev, marqueeImageUrl: undefined }))}
                          >
                            <X size={16} />
                          </button>
                        </div>
                      )}
                      
                      <label className="w-24 h-12 cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl border border-dashed border-gray-300 font-medium transition-colors flex flex-col items-center justify-center gap-1 text-[10px]">
                        <Upload size={16} />
                        Add Image
                        <input type="file" accept="image/*" multiple className="hidden" onChange={handleMarqueeImagesUpload} />
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-black border-b border-gray-100 pb-4">Spotlight</h2>
            <div className="space-y-6">
              <label className="flex items-center gap-3 cursor-pointer bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <input 
                  type="checkbox" 
                  checked={profile.isGalleryEnabled || false}
                  onChange={(e) => setProfile({...profile, isGalleryEnabled: e.target.checked})}
                  className="w-5 h-5 text-black rounded focus:ring-black"
                />
                <div>
                  <span className="font-bold text-black block">Enable Spotlight</span>
                  <span className="text-sm text-gray-500">Show a slow scrolling spotlight photo reel below the menu items.</span>
                </div>
              </label>

              {profile.isGalleryEnabled && (
                <div className="space-y-4">
                  <label className="font-medium text-black block text-sm">Spotlight Images</label>
                  <div className="flex flex-wrap gap-4 items-start">
                    {profile.galleryImageUrls?.map((url, i) => (
                      <div key={i} className="w-32 h-24 bg-gray-100 rounded-xl border border-gray-200 flex items-center justify-center overflow-hidden relative group">
                        <img src={url} alt={`Gallery ${i + 1}`} className="w-full h-full object-cover" />
                        <button 
                          type="button"
                          onClick={() => removeGalleryImage(i)}
                          className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X size={20} />
                        </button>
                      </div>
                    ))}
                    
                    <label className="w-32 h-24 cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl border border-dashed border-gray-300 font-medium transition-colors flex flex-col items-center justify-center gap-2 text-xs">
                      <Upload size={20} />
                      Add Photo
                      <input type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryImagesUpload} />
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="pt-6 border-t border-gray-100 flex justify-end">
            <button 
              type="submit" 
              disabled={saving}
              className="bg-black text-[#EADDC5] px-8 py-3 rounded-2xl font-bold hover:bg-gray-900 transition-colors disabled:opacity-50 flex items-center gap-2 shadow-ios-sm"
            >
              <Save size={20} />
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
    </div>
  );
};
