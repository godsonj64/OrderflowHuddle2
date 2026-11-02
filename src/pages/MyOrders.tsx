import React, { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Order } from '../types';
import { useAuth } from '../context/AuthContext';
import { Link, Navigate } from 'react-router-dom';
import { Clock, CheckCircle, Package, Truck, XCircle, ChevronRight, ShoppingBag } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';

export const MyOrders: React.FC = () => {
  const { userProfile, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!userProfile) return;

    const q = query(
      collection(db, 'orders'),
      where('customerId', '==', userProfile.uid),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'orders');
      setLoading(false);
    });

    return () => unsub();
  }, [userProfile, authLoading]);

  if (authLoading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
      </div>
    );
  }

  if (!userProfile) {
    return <Navigate to="/" />;
  }

  const getStatusIcon = (status: Order['status']) => {
    switch (status) {
      case 'new':
      case 'confirmed':
        return <Clock className="text-amber-500" size={20} />;
      case 'preparing':
        return <Package className="text-blue-500" size={20} />;
      case 'ready':
      case 'out_for_delivery':
        return <Truck className="text-indigo-500" size={20} />;
      case 'completed':
        return <CheckCircle className="text-emerald-500" size={20} />;
      case 'cancelled':
        return <XCircle className="text-red-500" size={20} />;
      default:
        return <Clock className="text-stone-400" size={20} />;
    }
  };

  const getStatusText = (status: Order['status'], type: Order['type']) => {
    switch (status) {
      case 'new': return 'Order Placed';
      case 'confirmed': return 'Confirmed';
      case 'preparing': return 'Preparing';
      case 'ready': return 'Ready for Pickup';
      case 'out_for_delivery': return 'Out for Delivery';
      case 'completed': return 'Completed';
      case 'cancelled': return 'Cancelled';
      default: return status;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8 px-4 sm:px-0">
      <div className="flex items-center gap-3 mb-6 sm:mb-8">
        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary rounded-full flex items-center justify-center text-white shadow-sm">
          <ShoppingBag size={24} className="sm:w-6 sm:h-6 w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-black">My Orders</h1>
          <p className="text-gray-500 text-sm sm:text-base">Track and view your order history</p>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-100 p-12 text-center flex flex-col items-center">
          <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100">
            <ShoppingBag size={32} className="text-gray-300" />
          </div>
          <h2 className="text-xl font-bold text-black mb-2">No orders yet</h2>
          <p className="text-gray-500 mb-6 text-sm">Looks like you haven't placed any orders yet.</p>
          <Link to="/" className="inline-block bg-primary text-white px-8 py-3.5 rounded-full font-bold hover:bg-primary-dark transition-all shadow-sm">
            Start Ordering
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map(order => (
            <Link 
              key={order.id} 
              to={`/order/${order.id}`}
              className="block bg-white rounded-[1.5rem] shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-100 p-5 sm:p-6 hover:shadow-md transition-all group"
            >
              <div className="flex flex-col sm:flex-row justify-between gap-4 sm:gap-6">
                <div className="flex-grow">
                  <div className="flex items-center gap-3 mb-2">
                    {getStatusIcon(order.status)}
                    <span className="font-bold text-black text-lg">
                      {getStatusText(order.status, order.type)}
                    </span>
                    <span className="text-gray-400 text-sm font-medium">
                      #{order.id.slice(-6).toUpperCase()}
                    </span>
                  </div>
                  
                  <div className="text-gray-500 text-sm mb-4">
                    {order.createdAt?.seconds ? new Date(order.createdAt.seconds * 1000).toLocaleString() : 'Recently'}
                    <span className="mx-2">&bull;</span>
                    {order.type === 'delivery' ? 'Delivery' : 'Pickup'}
                    {order.scheduledTime && (
                      <>
                        <span className="mx-2">&bull;</span>
                        <span className="text-emerald-600 font-medium">Scheduled: {order.scheduledTime}</span>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {order.items.slice(0, 3).map((item, idx) => (
                      <span key={idx} className="bg-gray-100 text-gray-600 text-xs font-medium px-2.5 py-1 rounded-xl">
                        {item.quantity}x {item.name}
                      </span>
                    ))}
                    {order.items.length > 3 && (
                      <span className="bg-gray-100 text-gray-600 text-xs font-medium px-2.5 py-1 rounded-xl">
                        +{order.items.length - 3} more
                      </span>
                    )}
                  </div>
                  {order.notes && (
                    <div className="mt-3 text-sm text-gray-600 truncate">
                      <span className="font-bold">Notes:</span> {order.notes}
                    </div>
                  )}
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 sm:border-l border-gray-100 pt-4 sm:pt-0 sm:pl-6 min-w-[120px]">
                  <div className="text-xl font-bold text-black mb-0 sm:mb-2">
                    ${order.total.toFixed(2)}
                  </div>
                  <div className="flex items-center text-emerald-600 font-medium text-sm group-hover:translate-x-1 transition-transform">
                    View Details <ChevronRight size={16} className="ml-1" />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
