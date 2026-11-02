import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, updateDoc, doc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Order } from '../types';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';
import { Truck, Package, PackageCheck, MapPin, Navigation, Phone, CheckCircle2, Camera } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { resizeAndConvertImage } from '../utils/imageUpload';

export const DriverDashboard: React.FC = () => {
  const { userProfile } = useAuth();
  const [availableOrders, setAvailableOrders] = useState<Order[]>([]);
  const [myOrders, setMyOrders] = useState<Order[]>([]);

  const [uploadingOrder, setUploadingOrder] = useState<string | null>(null);

  useEffect(() => {
    if (!userProfile) return;

    // Load available orders (ready, delivery type, no driver assigned pending)
    const qAvailable = query(
      collection(db, 'orders'),
      where('type', '==', 'delivery'),
      where('status', 'in', ['ready', 'preparing'])
    );
    
    // Note: Since Firestore requires composite indexes for complex queries or driverId filter, 
    // we fetch them and filter on the client for driverId since it's a small internal app.
    const unsubAvailable = onSnapshot(qAvailable, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      // Only show orders that don't have a driver assigned yet
      const unassigned = ordersData
        .filter(o => !o.driverId)
        .sort((a, b) => {
          const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
          const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
          return timeA - timeB;
        });
      setAvailableOrders(unassigned);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'orders'));

    // Load driver's currently assigned orders
    const qMyOrders = query(
      collection(db, 'orders'),
      where('type', '==', 'delivery'),
      where('driverId', '==', userProfile.uid)
    );
    const unsubMyOrders = onSnapshot(qMyOrders, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      // Filter active ones
      const active = ordersData.filter(o => ['assigned', 'picked_up'].includes(o.deliveryStatus || 'pending') && o.status !== 'completed');
      setMyOrders(active);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'orders'));

    return () => {
      unsubAvailable();
      unsubMyOrders();
    };
  }, [userProfile]);

  const acceptOrder = async (order: Order) => {
    if (!userProfile) return;
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        driverId: userProfile.uid,
        driverName: userProfile.name || userProfile.email,
        deliveryStatus: 'assigned',
        updatedAt: serverTimestamp()
      });
      toast.success('Order accepted! Please head to the kitchen to pick it up.');
    } catch (error) {
       handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
    }
  };

  const markPickedUp = async (orderId: string) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: 'out_for_delivery',
        deliveryStatus: 'picked_up',
        updatedAt: serverTimestamp()
      });
      toast.success('Order picked up! Navigate to the customer.');
    } catch (error) {
       handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const handleImageAndDeliver = async (e: React.ChangeEvent<HTMLInputElement>, orderId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingOrder(orderId);
    try {
      const base64Image = await resizeAndConvertImage(file, 800, 800);
      await updateDoc(doc(db, 'orders', orderId), {
        status: 'completed',
        deliveryStatus: 'delivered',
        proofOfDeliveryImage: base64Image,
        updatedAt: serverTimestamp()
      });
      toast.success('Order delivered successfully with proof!');
    } catch (error) {
       console.error(error);
       handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
    } finally {
       setUploadingOrder(null);
    }
  };

  if (!userProfile || (userProfile.role !== 'driver' && userProfile.role !== 'admin' && userProfile.role !== 'manager')) {
    return (
      <div className="flex justify-center items-center h-64 text-gray-500 font-medium">
        Access Denied. You must be a driver to view this page.
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-black mb-2">Driver Dashboard</h1>
        <p className="text-gray-500">Manage your deliveries and view available orders.</p>
      </div>

      {myOrders.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-black flex items-center gap-2">
            <Navigation className="text-primary" size={24} />
            My Active Deliveries ({myOrders.length})
          </h2>
          <div className="grid gap-4">
            {myOrders.map(order => (
              <div key={order.id} className="bg-primary text-white p-6 rounded-3xl shadow-ios-sm">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-2xl font-bold font-mono tracking-tight">#{order.id.slice(-6).toUpperCase()}</h3>
                    <p className="text-primary-light font-medium mt-1">{order.customerName}</p>
                  </div>
                  <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider backdrop-blur-md">
                    {order.deliveryStatus === 'picked_up' ? 'Out for Delivery' : 'To Pick Up'}
                  </span>
                </div>

                <div className="bg-black/20 rounded-2xl p-4 mb-4 space-y-3">
                  <div className="flex gap-3">
                    <MapPin size={18} className="text-primary-light shrink-0 mt-0.5" />
                    <span className="text-sm">{order.deliveryAddress}</span>
                  </div>
                  {order.customerPhone && (
                    <div className="flex gap-3">
                      <Phone size={18} className="text-primary-light shrink-0 mt-0.5" />
                      <a href={`tel:${order.customerPhone}`} className="text-sm font-medium hover:underline">{order.customerPhone}</a>
                    </div>
                  )}
                  {order.notes && (
                    <div className="text-sm bg-white/10 p-3 rounded-xl border border-white/10">
                      <strong>Notes:</strong> {order.notes}
                    </div>
                  )}
                  <div className="text-sm bg-white/10 p-3 rounded-xl border border-white/10">
                    <strong>Items:</strong> {order.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                  </div>
                </div>

                <div className="flex gap-3">
                  <a 
                    href={`https://maps.google.com/?q=${encodeURIComponent(order.deliveryAddress || '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 bg-white/10 hover:bg-white/20 text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    <MapPin size={18} /> Map
                  </a>
                  {order.deliveryStatus === 'assigned' ? (
                    <button 
                      onClick={() => markPickedUp(order.id)}
                      className="flex-[2] bg-white text-primary hover:bg-gray-100 py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
                    >
                      <Package size={18} /> Mark as Picked Up
                    </button>
                  ) : (
                    <>
                      <input 
                        type="file" 
                        id={`proof-${order.id}`}
                        accept="image/*" 
                        capture="environment" 
                        className="hidden" 
                        onChange={(e) => handleImageAndDeliver(e, order.id)}
                        disabled={uploadingOrder === order.id}
                      />
                      <label 
                        htmlFor={`proof-${order.id}`}
                        className={`flex-[2] py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 ${uploadingOrder === order.id ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-white text-primary hover:bg-gray-100 cursor-pointer'}`}
                      >
                        {uploadingOrder === order.id ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Camera size={18} /> Upload Proof & Complete
                          </>
                        )}
                      </label>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4 pt-4 border-t border-gray-100">
        <h2 className="text-xl font-bold text-black flex items-center gap-2">
          <Truck className="text-gray-500" size={24} />
          Available Orders ({availableOrders.length})
        </h2>
        {availableOrders.length === 0 ? (
          <div className="bg-gray-50 border border-dashed border-gray-200 rounded-3xl p-10 text-center text-gray-500">
            No delivery orders available right now. We'll update here as soon as they are ready.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {availableOrders.map(order => (
              <div key={order.id} className="bg-white border border-gray-100 rounded-3xl p-5 shadow-ios-sm flex flex-col hover:border-gray-300 transition-colors">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold text-lg font-mono tracking-tight text-black">#{order.id.slice(-6).toUpperCase()}</h3>
                    <p className="text-sm font-medium text-gray-500">{order.customerName}</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    order.status === 'ready' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                  }`}>
                    {order.status === 'ready' ? 'Ready to Pick Up' : 'Cooking'}
                  </span>
                </div>
                
                <div className="flex items-start gap-2 mb-4 mt-2">
                   <MapPin size={16} className="text-gray-400 mt-1 shrink-0" />
                   <p className="text-sm text-gray-600 line-clamp-2">{order.deliveryAddress}</p>
                </div>

                <div className="mt-auto pt-4 border-t border-gray-50">
                  <button 
                    onClick={() => acceptOrder(order)}
                    disabled={order.status !== 'ready' && order.status !== 'preparing'}
                    className="w-full bg-black text-white hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 py-3 rounded-xl font-bold transition-all text-sm flex items-center justify-center gap-2"
                  >
                    <PackageCheck size={18} />
                    Accept Delivery
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
