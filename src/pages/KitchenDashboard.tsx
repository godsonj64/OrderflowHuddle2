import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Order } from '../types';
import { toast } from 'react-hot-toast';
import { Clock, ChefHat, CheckCircle2, Package, Truck, Utensils, AlertCircle } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';

const LiveTimer = ({ createdAt }: { createdAt: any }) => {
  const [elapsed, setElapsed] = useState('');
  const [minutes, setMinutes] = useState(0);

  useEffect(() => {
    const update = () => {
      if (!createdAt) return;
      const orderTime = createdAt.toDate ? createdAt.toDate().getTime() : Date.now();
      const now = Date.now();
      const diffSecs = Math.floor(Math.max(0, now - orderTime) / 1000);
      const m = Math.floor(diffSecs / 60);
      const s = diffSecs % 60;
      setMinutes(m);
      setElapsed(`${m}:${s.toString().padStart(2, '0')}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [createdAt]);

  let color = 'text-[#EADDC5] bg-[#EADDC5]/10';
  if (minutes >= 20) color = 'text-red-400 bg-red-400/10 border-red-500/30 animate-pulse';
  else if (minutes >= 10) color = 'text-yellow-400 bg-yellow-400/10 border-yellow-500/30';
  
  return (
    <div className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-transparent ${color}`}>
      <Clock size={14} className={`sm:w-4 sm:h-4 shrink-0 ${minutes >= 20 ? 'animate-bounce' : ''}`} />
      <span className="font-mono font-bold text-sm sm:text-base tabular-nums tracking-wider">{elapsed}</span>
    </div>
  );
};

export const KitchenDashboard: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, 'orders'), 
      where('status', 'in', ['new', 'confirmed', 'preparing', 'ready'])
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      ordersData.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return timeA - timeB;
      });
      setOrders(ordersData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'orders');
    });
    return () => unsubscribe();
  }, []);

  const updateOrderStatus = async (orderId: string, status: Order['status']) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { status, updatedAt: serverTimestamp() });
      toast.success(`Order moved to ${status}`, { id: `kds-${orderId}` });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const columns = [
    { id: 'new', title: 'New Orders', icon: Package, buttonText: 'Accept Order', nextStatus: 'confirmed', color: 'border-blue-500/30' },
    { id: 'confirmed', title: 'To Prepare', icon: ChefHat, buttonText: 'Start Cooking', nextStatus: 'preparing', color: 'border-yellow-500/30' },
    { id: 'preparing', title: 'Cooking', icon: Utensils, buttonText: 'Mark Ready', nextStatus: 'ready', color: 'border-orange-500/30' },
    { id: 'ready', title: 'Ready', icon: CheckCircle2, buttonText: 'Complete', nextStatus: 'completed', color: 'border-green-500/30' }
  ] as const;

  return (
    <div className="bg-[#0B0E0B] p-4 sm:p-6 lg:p-8 text-[#F2EBE1] min-h-[calc(100vh-64px)] flex flex-col font-sans -mx-4 sm:-mx-6 lg:-mx-8 -mt-8 mb-[-32px] sm:mb-[-12px]">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 lg:mb-8 gap-4 pt-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-1">Kitchen Display System</h1>
          <p className="text-[#9BA89B] text-sm font-medium">{orders.length} active tickets</p>
        </div>
        <div className="flex flex-wrap gap-3 sm:gap-4 bg-[#1A211A] p-2.5 rounded-xl border border-[#293429]">
          <div className="flex items-center gap-2 text-xs font-bold tracking-wider uppercase text-[#9BA89B]">
            <div className="w-3 h-3 rounded-full bg-green-400/20 border border-green-400"></div> On Time
          </div>
          <div className="flex items-center gap-2 text-xs font-bold tracking-wider uppercase text-[#9BA89B]">
            <div className="w-3 h-3 rounded-full bg-yellow-400/20 border border-yellow-400"></div> &gt; 10m
          </div>
          <div className="flex items-center gap-2 text-xs font-bold tracking-wider uppercase text-[#9BA89B]">
            <div className="w-3 h-3 rounded-full bg-red-400/20 border border-red-500"></div> &gt; 20m
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-x-auto hide-scrollbar pb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 h-full items-start">
          {columns.map(col => {
            const colOrders = orders.filter(o => o.status === col.id);
            return (
              <div key={col.id} className={`w-full bg-[#1A211A] rounded-2xl border ${col.color} shadow-ios flex flex-col max-h-full overflow-hidden`}>
                <div className={`p-3 lg:p-4 border-b border-[#293429] flex justify-between items-center bg-[#0B0E0B]/50`}>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-[#293429] text-[#EADDC5] flex items-center justify-center">
                      <col.icon size={18} className="sm:w-[20px] sm:h-[20px]" />
                    </div>
                    <div>
                      <h2 className="text-base sm:text-lg font-bold text-white">{col.title}</h2>
                      <span className="text-[#9BA89B] text-[10px] sm:text-xs font-bold">{colOrders.length} TICKETS</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto hide-scrollbar p-2 sm:p-3 lg:p-4 flex flex-col gap-3 sm:gap-4">
                  {colOrders.length === 0 ? (
                    <div className="text-center p-6 sm:p-8 text-[#6B7D6B] border border-dashed border-[#384738] rounded-xl flex flex-col items-center gap-2">
                       <Utensils size={20} className="sm:w-[24px] sm:h-[24px] opacity-40" />
                       <p className="text-xs sm:text-sm font-medium">No tickets</p>
                    </div>
                  ) : (
                    colOrders.map(order => (
                      <div key={order.id} className="bg-[#0B0E0B] rounded-xl border border-[#384738] overflow-hidden flex flex-col transition-all hover:border-[#475A47]">
                        <div className="p-3 sm:p-4 border-b border-[#293429] flex justify-between items-start bg-[#1A211A] gap-2">
                          <div className="min-w-0">
                            <h3 className="text-base sm:text-lg lg:text-xl font-bold text-[#F2EBE1] font-mono tracking-tight cursor-pointer hover:underline truncate" onClick={() => {
                                navigator.clipboard.writeText(order.id);
                                toast.success("Order ID copied");
                            }}>#{order.id.slice(-4).toUpperCase()}</h3>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              <span className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-wider px-1.5 sm:px-2 py-0.5 rounded-full shrink-0 ${order.type === 'delivery' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'}`}>
                                {order.type === 'delivery' ? <Truck size={10} className="inline mr-0.5 sm:mr-1" /> : <Package size={10} className="inline mr-0.5 sm:mr-1" />}
                                {order.type === 'delivery' ? 'Del' : 'Pick'}
                              </span>
                              <span className="text-[#9BA89B] text-[10px] sm:text-xs font-medium truncate max-w-[80px] sm:max-w-[100px]">{order.customerName}</span>
                            </div>
                          </div>
                          <div className="shrink-0">
                            <LiveTimer createdAt={order.createdAt} />
                          </div>
                        </div>
                        
                        <div className="p-3 sm:p-4 flex flex-col gap-3">
                          {order.items.map((item, i) => (
                            <div key={i} className="flex gap-2 sm:gap-3">
                              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#293429] text-[#F2EBE1] font-bold flex items-center justify-center shrink-0 text-sm sm:text-base">
                                {item.quantity}
                              </div>
                              <div>
                                <p className="text-sm sm:text-base font-semibold text-[#F2EBE1] leading-tight">{item.name}</p>
                                {item.modifiers && item.modifiers.length > 0 && (
                                  <ul className="mt-1 flex flex-wrap gap-1">
                                    {item.modifiers.map((mod, j) => (
                                      <li key={j} className="text-[10px] sm:text-[11px] font-medium text-[#EADDC5] bg-[#384738] px-1.5 py-0.5 rounded-md">+{mod.name}</li>
                                    ))}
                                  </ul>
                                )}
                                {item.prepNotes && (
                                  <p className="mt-1.5 text-[11px] sm:text-xs font-medium text-red-400 bg-red-400/10 border border-red-500/20 px-2 py-1 rounded-md flex items-start gap-1.5">
                                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                    <span>{item.prepNotes}</span>
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        <div className="p-3 sm:p-4 pt-0 mt-1 sm:mt-2">
                          <button
                            onClick={() => updateOrderStatus(order.id, col.nextStatus)}
                            disabled={col.id === 'ready' && order.type === 'delivery'}
                            className={`w-full py-2.5 sm:py-3.5 rounded-xl font-bold text-xs sm:text-sm uppercase tracking-wider transition-all
                              ${col.id === 'new' ? 'bg-[#384738] text-white hover:bg-[#475A47]' : 
                                col.id === 'ready' ? 
                                  (order.type === 'delivery' ? 'bg-[#293429] text-[#9BA89B] cursor-not-allowed border border-[#384738]' : 'bg-green-600 text-white hover:bg-green-500') :
                                'bg-[#EADDC5] text-[#0B0E0B] hover:bg-white shadow-[0_0_15px_rgba(234,221,197,0.1)] hover:shadow-[0_0_20px_rgba(234,221,197,0.2)]'
                              }
                            `}
                          >
                            {col.id === 'ready' && order.type === 'delivery' ? 'Waiting for Driver' : col.buttonText}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
