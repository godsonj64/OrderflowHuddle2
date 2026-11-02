import { useCallback, useMemo } from 'react';
import { deleteField, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { db } from '../firebase';
import type { Order, OrderStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { STATUS_LABEL } from '../lib/orderStatus';
import { orderCode } from '../lib/ids';
import { formatMoney } from '../lib/money';
import { friendlyError, reportError } from '../utils/errorHandling';

/**
 * Staff actions on orders. Status changes and cash payments are written directly to
 * Firestore (security rules allow exactly these fields); cancellations and refunds go
 * through the server so card payments are refunded.
 */
export function useOrderActions() {
  const { userProfile } = useAuth();
  const staffName = (userProfile?.name || userProfile?.email || 'Staff').slice(0, 100);

  const setStatus = useCallback(async (order: Order, status: OrderStatus) => {
    try {
      await updateDoc(doc(db, 'orders', order.id), { status, updatedAt: serverTimestamp() });
      toast.success(`#${orderCode(order)} → ${STATUS_LABEL[status]}`, { id: `status-${order.id}` });
    } catch (err) {
      reportError(err, 'order-status', { message: friendlyError(err, 'Could not update the order.') });
    }
  }, []);

  const markCashPaid = useCallback(
    async (order: Order, complete = false) => {
      try {
        await updateDoc(doc(db, 'orders', order.id), {
          paymentStatus: 'paid',
          paidAt: serverTimestamp(),
          paymentCollectedBy: staffName,
          ...(complete ? { status: 'completed' } : {}),
          updatedAt: serverTimestamp(),
        });
        toast.success(`${formatMoney(order.total)} cash recorded for #${orderCode(order)}`, { id: `cash-${order.id}` });
      } catch (err) {
        reportError(err, 'cash-paid', { message: friendlyError(err, 'Could not record the payment.') });
      }
    },
    [staffName],
  );

  const undoCashPaid = useCallback(async (order: Order) => {
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        paymentStatus: 'pending',
        paidAt: deleteField(),
        paymentCollectedBy: deleteField(),
        updatedAt: serverTimestamp(),
      });
      toast.success(`Cash payment removed for #${orderCode(order)}`);
    } catch (err) {
      reportError(err, 'cash-undo', { message: friendlyError(err, 'Could not update the payment.') });
    }
  }, []);

  return useMemo(() => ({ setStatus, markCashPaid, undoCashPaid, staffName }), [setStatus, markCashPaid, undoCashPaid, staffName]);
}
