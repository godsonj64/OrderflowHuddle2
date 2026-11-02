import React, { useMemo, useState } from 'react';
import { Order } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { format, subDays, isSameDay, subHours, subMonths, endOfDay } from 'date-fns';
import { DollarSign, TrendingUp, ShoppingBag, Users, Download, Calendar } from 'lucide-react';

interface AdminFinancialsProps {
  orders: Order[];
}

type TimeRange = 'last_hour' | 'today' | 'last_7_days' | 'last_month' | 'custom';

export const AdminFinancials: React.FC<AdminFinancialsProps> = ({ orders }) => {
  const [timeRange, setTimeRange] = useState<TimeRange>('last_7_days');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  const completedOrders = useMemo(() => {
    const now = new Date();
    return orders.filter(o => {
      if (o.status !== 'completed') return false;
      const orderDate = o.createdAt ? new Date((o.createdAt as any).seconds * 1000) : new Date();
      
      if (timeRange === 'last_hour') {
        return orderDate >= subHours(now, 1);
      } else if (timeRange === 'today') {
        return isSameDay(orderDate, now);
      } else if (timeRange === 'last_7_days') {
        return orderDate >= subDays(now, 7);
      } else if (timeRange === 'last_month') {
        return orderDate >= subMonths(now, 1);
      } else if (timeRange === 'custom') {
        if (customStartDate && customEndDate) {
          return orderDate >= new Date(customStartDate) && orderDate <= endOfDay(new Date(customEndDate));
        }
        return true;
      }
      return true;
    });
  }, [orders, timeRange, customStartDate, customEndDate]);
  
  const totalRevenue = completedOrders.reduce((sum, o) => sum + o.total, 0);
  const averageOrderValue = completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0;

  const revenueData = useMemo(() => {
    const now = new Date();
    if (timeRange === 'last_hour') {
      return [{ date: 'Last Hour', revenue: totalRevenue, orders: completedOrders.length }];
    } else if (timeRange === 'today') {
      const hours = Array.from({ length: 24 }).map((_, i) => i);
      return hours.map(hour => {
        const hourOrders = completedOrders.filter(o => {
          const orderDate = o.createdAt ? new Date((o.createdAt as any).seconds * 1000) : new Date();
          return orderDate.getHours() === hour;
        });
        return {
          date: `${hour}:00`,
          revenue: hourOrders.reduce((sum, o) => sum + o.total, 0),
          orders: hourOrders.length
        };
      }).filter(d => d.revenue > 0 || d.orders > 0);
    } else if (timeRange === 'last_7_days') {
      const last7Days = Array.from({ length: 7 }).map((_, i) => subDays(now, i)).reverse();
      return last7Days.map(date => {
        const dayOrders = completedOrders.filter(o => {
          const orderDate = o.createdAt ? new Date((o.createdAt as any).seconds * 1000) : new Date();
          return isSameDay(orderDate, date);
        });
        return {
          date: format(date, 'MMM dd'),
          revenue: dayOrders.reduce((sum, o) => sum + o.total, 0),
          orders: dayOrders.length
        };
      });
    } else if (timeRange === 'last_month') {
      const last30Days = Array.from({ length: 30 }).map((_, i) => subDays(now, i)).reverse();
      return last30Days.map(date => {
        const dayOrders = completedOrders.filter(o => {
          const orderDate = o.createdAt ? new Date((o.createdAt as any).seconds * 1000) : new Date();
          return isSameDay(orderDate, date);
        });
        return {
          date: format(date, 'MMM dd'),
          revenue: dayOrders.reduce((sum, o) => sum + o.total, 0),
          orders: dayOrders.length
        };
      });
    } else if (timeRange === 'custom') {
      if (!customStartDate || !customEndDate) return [];
      const start = new Date(customStartDate);
      const end = new Date(customEndDate);
      const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24));
      
      if (diffDays <= 31) {
        const days = Array.from({ length: diffDays + 1 }).map((_, i) => {
          const d = new Date(start);
          d.setDate(d.getDate() + i);
          return d;
        });
        return days.map(date => {
          const dayOrders = completedOrders.filter(o => {
            const orderDate = o.createdAt ? new Date((o.createdAt as any).seconds * 1000) : new Date();
            return isSameDay(orderDate, date);
          });
          return {
            date: format(date, 'MMM dd'),
            revenue: dayOrders.reduce((sum, o) => sum + o.total, 0),
            orders: dayOrders.length
          };
        });
      } else {
        const months: Record<string, { revenue: number, orders: number }> = {};
        completedOrders.forEach(o => {
          const orderDate = o.createdAt ? new Date((o.createdAt as any).seconds * 1000) : new Date();
          const monthKey = format(orderDate, 'MMM yyyy');
          if (!months[monthKey]) months[monthKey] = { revenue: 0, orders: 0 };
          months[monthKey].revenue += o.total;
          months[monthKey].orders += 1;
        });
        return Object.entries(months).map(([date, data]) => ({
          date,
          revenue: data.revenue,
          orders: data.orders
        }));
      }
    }
    return [];
  }, [completedOrders, timeRange, customStartDate, customEndDate, totalRevenue]);

  const topItems = useMemo(() => {
    const itemCounts: Record<string, { name: string, quantity: number, revenue: number }> = {};
    completedOrders.forEach(order => {
      order.items.forEach(item => {
        if (!itemCounts[item.id]) {
          itemCounts[item.id] = { name: item.name, quantity: 0, revenue: 0 };
        }
        itemCounts[item.id].quantity += item.quantity;
        itemCounts[item.id].revenue += item.price * item.quantity;
      });
    });
    return Object.values(itemCounts)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [completedOrders]);

  const COLORS = ['#000000', '#333333', '#666666', '#999999', '#CCCCCC'];

  const exportToCSV = () => {
    const headers = ['Order ID', 'Date', 'Customer Name', 'Total', 'Status', 'Items'];
    const csvContent = [
      headers.join(','),
      ...orders.map(o => {
        const date = o.createdAt ? new Date((o.createdAt as any).seconds * 1000).toLocaleDateString() : '';
        const itemsStr = o.items.map(i => `${i.quantity}x ${i.name}`).join('; ');
        return `"${o.id}","${date}","${o.customerName || 'Guest'}","${o.total.toFixed(2)}","${o.status}","${itemsStr}"`;
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `sales_report_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 sm:space-y-8 mb-8 sm:mb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-black">Financial Overview</h2>
          <p className="text-sm sm:text-base text-gray-500">Track your restaurant's performance</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto hide-scrollbar pb-1 sm:pb-0">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRange)}
              className="bg-white border border-gray-200 text-gray-700 text-sm rounded-2xl focus:ring-black focus:border-black block p-2.5 shadow-sm outline-none"
            >
              <option value="last_hour">Last Hour</option>
              <option value="today">Today</option>
              <option value="last_7_days">Last 7 Days</option>
              <option value="last_month">Last Month</option>
              <option value="custom">Custom Range</option>
            </select>
            
            {timeRange === 'custom' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="bg-white border border-gray-200 text-gray-700 text-sm rounded-2xl focus:ring-black focus:border-black block p-2.5 shadow-sm outline-none"
                />
                <span className="text-gray-400">-</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-white border border-gray-200 text-gray-700 text-sm rounded-2xl focus:ring-black focus:border-black block p-2.5 shadow-sm outline-none"
                />
              </div>
            )}
          </div>
          
          <button 
            onClick={exportToCSV}
            className="w-full sm:w-auto flex justify-center items-center gap-2 bg-black text-[#EADDC5] px-4 py-2.5 sm:py-2.5 rounded-2xl hover:bg-gray-900 transition-colors shadow-ios-sm text-sm font-medium shrink-0"
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-white p-5 sm:p-6 rounded-[2rem] shadow-ios-sm border border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-100 text-black rounded-2xl flex items-center justify-center shrink-0">
              <DollarSign size={20} className="sm:w-6 sm:h-6" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-500 uppercase tracking-wider">Total Revenue</p>
              <h3 className="text-2xl sm:text-3xl font-bold text-black">${totalRevenue.toFixed(2)}</h3>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-5 sm:p-6 rounded-[2rem] shadow-ios-sm border border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-100 text-black rounded-2xl flex items-center justify-center shrink-0">
              <ShoppingBag size={20} className="sm:w-6 sm:h-6" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-500 uppercase tracking-wider">Total Orders</p>
              <h3 className="text-2xl sm:text-3xl font-bold text-black">{completedOrders.length}</h3>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 sm:p-6 rounded-[2rem] shadow-ios-sm border border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-100 text-black rounded-2xl flex items-center justify-center shrink-0">
              <TrendingUp size={20} className="sm:w-6 sm:h-6" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-500 uppercase tracking-wider">Avg Order Value</p>
              <h3 className="text-2xl sm:text-3xl font-bold text-black">${averageOrderValue.toFixed(2)}</h3>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 sm:p-6 rounded-[2rem] shadow-ios-sm border border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-100 text-black rounded-2xl flex items-center justify-center shrink-0">
              <Users size={20} className="sm:w-6 sm:h-6" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-500 uppercase tracking-wider">Active Orders</p>
              <h3 className="text-2xl sm:text-3xl font-bold text-black">{orders.filter(o => !['completed', 'cancelled'].includes(o.status)).length}</h3>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="bg-white p-5 sm:p-8 rounded-[2rem] shadow-ios-sm border border-gray-100 lg:col-span-2 overflow-hidden">
          <h3 className="text-xl sm:text-2xl font-bold text-black mb-6 sm:mb-8">
            Revenue ({timeRange === 'last_hour' ? 'Last Hour' : timeRange === 'today' ? 'Today' : timeRange === 'last_7_days' ? 'Last 7 Days' : timeRange === 'last_month' ? 'Last Month' : 'Custom Range'})
          </h3>
          <div className="h-60 sm:h-72 w-full min-w-0 min-h-0">
            <ResponsiveContainer width="99%" height="100%">
              <BarChart data={revenueData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} tickFormatter={(value) => `$${value}`} />
                <Tooltip 
                  cursor={{ fill: '#f3f4f6' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, 'Revenue']}
                />
                <Bar dataKey="revenue" fill="#000000" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-5 sm:p-8 rounded-[2rem] shadow-ios-sm border border-gray-100 overflow-hidden">
          <h3 className="text-xl sm:text-2xl font-bold text-black mb-6 sm:mb-8">Top Selling Items</h3>
          {topItems.length > 0 ? (
            <div className="h-60 sm:h-72 flex flex-col w-full min-w-0 min-h-0">
              <ResponsiveContainer width="99%" height="100%">
                <PieChart>
                  <Pie
                    data={topItems}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={5}
                    dataKey="revenue"
                  >
                    {topItems.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: number) => [`$${value.toFixed(2)}`, 'Revenue']}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-60 sm:h-72 flex items-center justify-center text-gray-400 text-sm sm:text-base">
              No sales data available
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
