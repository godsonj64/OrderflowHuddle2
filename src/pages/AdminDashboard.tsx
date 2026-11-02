import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy, updateDoc, doc, increment, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Order } from '../types';
import { useAuth } from '../context/AuthContext';
import { Navigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, CheckCircle, Package, Truck, XCircle, Settings, LayoutList, Search, Filter, RefreshCw, Users, Tag } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { AdminFinancials } from '../components/AdminFinancials';

export const AdminDashboard: React.FC = () => {
  const { userProfile, loading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    if (loading) return;
    if (!userProfile || !['admin', 'restaurant_owner', 'manager', 'staff'].includes(userProfile.role)) return;

    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order)));
      setLoadingOrders(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'orders'));

    return () => unsub();
  }, [userProfile, loading]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
      </div>
    );
  }

  if (!userProfile || !['admin', 'restaurant_owner', 'manager', 'staff'].includes(userProfile.role)) {
    return <Navigate to="/" />;
  }

  const updateOrderStatus = async (orderId: string, status: Order['status']) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { status });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const [refundModal, setRefundModal] = useState<{ isOpen: boolean, order: Order | null, amount: string }>({ isOpen: false, order: null, amount: '' });

  const handleRefund = async (order: Order) => {
    if (!order.paymentIntentId) {
      // Use a custom alert or just console.error for now, or a toast
      console.error('This order does not have a Stripe payment intent associated with it.');
      return;
    }
    setRefundModal({ isOpen: true, order, amount: order.total.toFixed(2) });
  };

  const confirmRefund = async () => {
    const { order, amount: amountStr } = refundModal;
    if (!order) return;

    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0 || amount > order.total) {
      console.error('Invalid refund amount.');
      return;
    }

    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error('You must be logged in to perform a refund.');
      }

      const response = await fetch('/api/refund', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          paymentIntentId: order.paymentIntentId,
          amount: amount,
        }),
      });

      const data = await response.json();

      if (data.success) {
        const isFullRefund = amount >= order.total;
        await updateDoc(doc(db, 'orders', order.id), {
          paymentStatus: isFullRefund ? 'refunded' : 'partially_refunded',
          refundAmount: increment(amount),
          status: isFullRefund ? 'cancelled' : order.status,
          updatedAt: serverTimestamp()
        });
        setRefundModal({ isOpen: false, order: null, amount: '' });
      } else {
        throw new Error(data.error || 'Refund failed');
      }
    } catch (error: any) {
      console.error('Refund error:', error);
      alert(error.message || 'Refund failed');
    }
  };

  const filteredOrders = orders.filter(o => {
    const matchesSearch = o.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          o.customerName?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const activeOrders = filteredOrders.filter(o => !['completed', 'cancelled'].includes(o.status));
  const pastOrders = filteredOrders.filter(o => ['completed', 'cancelled'].includes(o.status));

  const statusColors: Record<Order['status'], string> = {
    new: 'bg-blue-100 text-blue-800 border-blue-200',
    confirmed: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    preparing: 'bg-amber-100 text-amber-800 border-amber-200',
    ready: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    out_for_delivery: 'bg-purple-100 text-purple-800 border-purple-200',
    completed: 'bg-stone-100 text-stone-800 border-stone-200',
    cancelled: 'bg-red-100 text-red-800 border-red-200',
  };

  if (loadingOrders) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 sm:p-8 rounded-[2rem] shadow-ios-sm border border-gray-100 gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-black mb-2">Admin Dashboard</h1>
          <p className="text-gray-500 text-base sm:text-lg">Manage orders, menu, and store settings.</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3 w-full md:w-auto">
          {['admin', 'restaurant_owner', 'manager'].includes(userProfile.role) && (
            <Link to="/admin/users" className="flex-1 md:flex-none justify-center flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 sm:px-5 py-2.5 rounded-2xl font-medium transition-colors shadow-ios-sm text-sm sm:text-base">
              <Users size={18} className="sm:w-5 sm:h-5" />
              Users
            </Link>
          )}
          {['admin', 'restaurant_owner', 'manager'].includes(userProfile.role) && (
            <Link to="/admin/promos" className="flex-1 md:flex-none justify-center flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 sm:px-5 py-2.5 rounded-2xl font-medium transition-colors shadow-ios-sm text-sm sm:text-base">
              <Tag size={18} className="sm:w-5 sm:h-5" />
              Promos
            </Link>
          )}
          {['admin', 'restaurant_owner', 'manager'].includes(userProfile.role) && (
            <Link to="/admin/kitchen" className="flex-1 md:flex-none justify-center flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 sm:px-5 py-2.5 rounded-2xl font-medium transition-colors shadow-ios-sm text-sm sm:text-base">
              <LayoutList size={18} className="sm:w-5 sm:h-5" />
              Kitchen
            </Link>
          )}
          {['admin', 'restaurant_owner', 'manager'].includes(userProfile.role) && (
            <Link to="/admin/menu" className="flex-1 md:flex-none justify-center flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 sm:px-5 py-2.5 rounded-2xl font-medium transition-colors shadow-ios-sm text-sm sm:text-base">
              <LayoutList size={18} className="sm:w-5 sm:h-5" />
              Menu
            </Link>
          )}
          {['admin', 'restaurant_owner', 'manager'].includes(userProfile.role) && (
            <Link to="/admin/settings" className="flex-1 md:flex-none justify-center flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 sm:px-5 py-2.5 rounded-2xl font-medium transition-colors shadow-ios-sm text-sm sm:text-base">
              <Settings size={18} className="sm:w-5 sm:h-5" />
              Settings
            </Link>
          )}
        </div>
      </div>

      {['admin', 'restaurant_owner', 'manager'].includes(userProfile.role) && <AdminFinancials orders={orders} />}

      <div className="bg-white p-4 sm:p-8 rounded-[2rem] shadow-ios-sm border border-gray-100 mb-6 sm:mb-8 flex flex-col md:flex-row gap-3 sm:gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input 
            type="text" 
            placeholder="Search by Order ID or Customer Name..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 sm:py-4 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-black focus:border-black outline-none transition-all text-sm sm:text-base"
          />
        </div>
        <div className="relative md:min-w-[240px]">
          <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full pl-12 pr-4 py-3 sm:py-4 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-black focus:border-black outline-none appearance-none bg-white transition-all text-sm sm:text-base"
          >
            <option value="all">All Statuses</option>
            <option value="new">New</option>
            <option value="confirmed">Confirmed</option>
            <option value="preparing">Preparing</option>
            <option value="ready">Ready for Pickup</option>
            <option value="out_for_delivery">Out for Delivery</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-10">
        {/* Active Orders */}
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-black flex items-center gap-2 sm:gap-3 mb-4 sm:mb-8">
            <Clock className="text-emerald-600 w-6 h-6 sm:w-7 sm:h-7" /> Active Orders ({activeOrders.length})
          </h2>
          {activeOrders.length === 0 ? (
            <div className="bg-white p-8 sm:p-12 rounded-[2rem] shadow-ios-sm border border-gray-100 text-center text-gray-500 text-base sm:text-lg">
              No active orders found.
            </div>
          ) : (
            <AnimatePresence>
              {activeOrders.map(order => (
                <motion.div 
                  layout 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  key={order.id} 
                  className="bg-white p-5 sm:p-8 rounded-[2rem] shadow-ios-sm border border-gray-100 space-y-4 sm:space-y-6"
                >
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-3 sm:gap-4">
                    <div className="w-full sm:w-auto">
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-1">
                        <h3 className="font-bold text-base sm:text-lg text-black">Order #{order.id.slice(-6).toUpperCase()}</h3>
                        <span className={`px-2 py-0.5 sm:px-3 sm:py-1 rounded-xl text-[10px] sm:text-xs font-bold uppercase tracking-wider border ${statusColors[order.status]}`}>
                          {order.status.replace('_', ' ')}
                        </span>
                        {order.paymentStatus === 'paid' && (
                          <span className="px-2 py-0.5 sm:px-3 sm:py-1 rounded-xl text-[10px] sm:text-xs font-bold uppercase tracking-wider border bg-emerald-50 text-emerald-700 border-emerald-200">
                            Paid
                          </span>
                        )}
                        {order.paymentStatus === 'refunded' && (
                          <span className="px-2 py-0.5 sm:px-3 sm:py-1 rounded-xl text-[10px] sm:text-xs font-bold uppercase tracking-wider border bg-red-50 text-red-700 border-red-200">
                            Refunded
                          </span>
                        )}
                        {order.paymentStatus === 'partially_refunded' && (
                          <span className="px-2 py-0.5 sm:px-3 sm:py-1 rounded-xl text-[10px] sm:text-xs font-bold uppercase tracking-wider border bg-amber-50 text-amber-700 border-amber-200">
                            Partially Refunded (${order.refundAmount?.toFixed(2)})
                          </span>
                        )}
                      </div>
                      <p className="text-gray-500 text-xs sm:text-sm font-medium">{order.customerName} &bull; {order.type.toUpperCase()}</p>
                      {order.customerPhone && (
                        <p className="text-gray-500 text-xs sm:text-sm mt-1">
                          <a href={`tel:${order.customerPhone}`} className="hover:text-black transition-colors">📞 {order.customerPhone}</a>
                        </p>
                      )}
                      {order.type === 'delivery' && order.deliveryAddress && (
                        <p className="text-gray-500 text-xs sm:text-sm mt-1">{order.deliveryAddress}</p>
                      )}
                      {order.scheduledTime && (
                        <p className="text-emerald-600 font-medium text-xs sm:text-sm mt-1">
                          📅 Scheduled: {order.scheduledTime}
                        </p>
                      )}
                    </div>
                    <div className="text-left sm:text-right w-full sm:w-auto flex flex-row sm:flex-col justify-between sm:justify-start items-center sm:items-end">
                      <p className="font-bold text-lg sm:text-xl text-black">${order.total.toFixed(2)}</p>
                      <p className="text-[10px] sm:text-xs text-gray-400">
                        {order.createdAt ? new Date((order.createdAt as any).seconds * 1000).toLocaleTimeString() : 'Just now'}
                      </p>
                    </div>
                  </div>

                  <div className="bg-gray-50 p-3 sm:p-4 rounded-2xl space-y-2">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-xs sm:text-sm">
                        <span className="font-medium text-gray-700">
                          <span className="text-gray-400 mr-1 sm:mr-2">{item.quantity}x</span> 
                          {item.name}
                        </span>
                        <span className="text-gray-500">${(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                    {order.notes && (
                      <div className="pt-2 mt-2 border-t border-gray-200">
                        <span className="font-bold text-xs sm:text-sm text-black block mb-1">Notes & Allergies:</span>
                        <span className="text-gray-600 text-xs sm:text-sm">{order.notes}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-3 sm:pt-4 border-t border-gray-100">
                    {order.status === 'new' && (
                      <button onClick={() => updateOrderStatus(order.id, 'confirmed')} className="flex-1 sm:flex-none justify-center bg-indigo-600 hover:bg-indigo-700 text-[#EADDC5] px-4 sm:px-5 py-2 sm:py-2.5 rounded-2xl text-xs sm:text-sm font-medium transition-colors shadow-ios-sm">
                        Confirm Order
                      </button>
                    )}
                    {order.status === 'confirmed' && (
                      <button onClick={() => updateOrderStatus(order.id, 'preparing')} className="flex-1 sm:flex-none justify-center bg-amber-600 hover:bg-amber-700 text-[#EADDC5] px-4 sm:px-5 py-2 sm:py-2.5 rounded-2xl text-xs sm:text-sm font-medium transition-colors shadow-ios-sm">
                        Start Preparing
                      </button>
                    )}
                    {order.status === 'preparing' && order.type === 'pickup' && (
                      <button onClick={() => updateOrderStatus(order.id, 'ready')} className="flex-1 sm:flex-none justify-center bg-emerald-600 hover:bg-emerald-700 text-[#EADDC5] px-4 sm:px-5 py-2 sm:py-2.5 rounded-2xl text-xs sm:text-sm font-medium transition-colors shadow-ios-sm">
                        Mark Ready for Pickup
                      </button>
                    )}
                    {order.status === 'preparing' && order.type === 'delivery' && (
                      <button onClick={() => updateOrderStatus(order.id, 'out_for_delivery')} className="flex-1 sm:flex-none justify-center bg-purple-600 hover:bg-purple-700 text-[#EADDC5] px-4 sm:px-5 py-2 sm:py-2.5 rounded-2xl text-xs sm:text-sm font-medium transition-colors shadow-ios-sm">
                        Out for Delivery
                      </button>
                    )}
                    {(order.status === 'ready' || order.status === 'out_for_delivery') && (
                      <button onClick={() => updateOrderStatus(order.id, 'completed')} className="flex-1 sm:flex-none justify-center bg-black hover:bg-gray-900 text-[#EADDC5] px-4 sm:px-5 py-2 sm:py-2.5 rounded-2xl text-xs sm:text-sm font-medium transition-colors shadow-ios-sm">
                        Complete Order
                      </button>
                    )}
                    <button onClick={() => updateOrderStatus(order.id, 'cancelled')} className="flex-1 sm:flex-none justify-center text-red-600 hover:bg-red-50 px-4 sm:px-5 py-2 sm:py-2.5 rounded-2xl text-xs sm:text-sm font-medium transition-colors sm:ml-auto border border-red-100 sm:border-transparent">
                      Cancel Order
                    </button>
                    {['admin', 'restaurant_owner', 'manager'].includes(userProfile.role) && order.paymentIntentId && ['paid', 'partially_refunded'].includes(order.paymentStatus || '') && (
                      <button onClick={() => handleRefund(order)} className="flex-1 sm:flex-none justify-center text-amber-600 hover:bg-amber-50 px-4 sm:px-5 py-2 sm:py-2.5 rounded-2xl text-xs sm:text-sm font-medium transition-colors border border-amber-100 sm:border-transparent flex items-center gap-1">
                        <RefreshCw size={14} /> Refund
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Past Orders */}
        <div className="space-y-4 sm:space-y-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-black flex items-center gap-2 sm:gap-3 mb-4 sm:mb-8">
            <CheckCircle className="text-gray-400 w-6 h-6 sm:w-7 sm:h-7" /> Recent History
          </h2>
          <div className="bg-white rounded-[2rem] shadow-ios-sm border border-gray-100 overflow-hidden">
            {pastOrders.length === 0 ? (
              <div className="p-8 sm:p-12 text-center text-gray-500 text-base sm:text-lg">No past orders found.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {pastOrders.slice(0, 15).map(order => (
                  <div key={order.id} className="p-4 sm:p-6 hover:bg-gray-50 transition-colors flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="min-w-0 w-full sm:w-auto">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-bold text-black text-base sm:text-lg truncate">#{order.id.slice(-6).toUpperCase()}</h4>
                        <span className={`shrink-0 px-2 py-0.5 sm:px-3 sm:py-1 rounded-xl text-[10px] sm:text-xs font-bold uppercase tracking-wider ${order.status === 'completed' ? 'bg-gray-100 text-gray-600' : 'bg-red-100 text-red-600'}`}>
                          {order.status}
                        </span>
                        {order.paymentStatus === 'refunded' && (
                          <span className="shrink-0 px-2 py-0.5 sm:px-3 sm:py-1 rounded-xl text-[10px] sm:text-xs font-bold uppercase tracking-wider bg-red-50 text-red-700 border border-red-200">
                            Refunded
                          </span>
                        )}
                        {order.paymentStatus === 'partially_refunded' && (
                          <span className="shrink-0 px-2 py-0.5 sm:px-3 sm:py-1 rounded-xl text-[10px] sm:text-xs font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
                            Part. Refunded (${order.refundAmount?.toFixed(2)})
                          </span>
                        )}
                      </div>
                      <p className="text-xs sm:text-sm text-gray-500 mt-0.5 sm:mt-1 truncate">{order.customerName} &bull; ${order.total.toFixed(2)}</p>
                      {order.notes && (
                        <p className="text-xs sm:text-sm text-gray-600 mt-1 truncate"><span className="font-bold">Notes:</span> {order.notes}</p>
                      )}
                    </div>
                    {['admin', 'restaurant_owner', 'manager'].includes(userProfile.role) && order.paymentIntentId && ['paid', 'partially_refunded'].includes(order.paymentStatus || '') && (
                      <button onClick={() => handleRefund(order)} className="shrink-0 text-amber-600 hover:bg-amber-50 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors border border-amber-100 flex items-center gap-1">
                        <RefreshCw size={14} /> Refund
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Refund Modal */}
      {refundModal.isOpen && refundModal.order && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-[2rem] p-6 sm:p-8 max-w-md w-full shadow-ios-lg">
            <h3 className="text-2xl font-bold text-black mb-4">Process Refund</h3>
            <p className="text-gray-500 mb-6">
              Enter the amount to refund for Order #{refundModal.order.id.slice(-6).toUpperCase()}.
              <br />
              <span className="text-sm font-medium text-gray-700">Max available: ${refundModal.order.total.toFixed(2)}</span>
            </p>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Refund Amount ($)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={refundModal.order.total}
                value={refundModal.amount}
                onChange={(e) => setRefundModal({ ...refundModal, amount: e.target.value })}
                className="w-full border border-gray-200 rounded-2xl p-3 focus:ring-2 focus:ring-black focus:border-black outline-none"
              />
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setRefundModal({ isOpen: false, order: null, amount: '' })}
                className="flex-1 px-4 py-3 rounded-2xl font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmRefund}
                className="flex-1 px-4 py-3 rounded-2xl font-medium text-[#EADDC5] bg-amber-600 hover:bg-amber-700 transition-colors shadow-ios-sm"
              >
                Confirm Refund
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
