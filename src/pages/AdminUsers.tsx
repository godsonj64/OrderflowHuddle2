import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, arrayUnion, arrayRemove, setDoc, serverTimestamp } from 'firebase/firestore';
import { initializeApp, getApp, getApps, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { db } from '../firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import { UserProfile, PromoCode, UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { Search, Mail, Phone, ShoppingBag, DollarSign, Tag, X, UserPlus, Shield } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { Link, useNavigate } from 'react-router-dom';

export const AdminUsers: React.FC = () => {
  const { userProfile, loading } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingPromos, setLoadingPromos] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isAssigningPromo, setIsAssigningPromo] = useState(false);
  const [selectedPromoId, setSelectedPromoId] = useState('');
  
  // Create User Modal State
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('staff');
  const [newUserError, setNewUserError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (userProfile?.role !== 'admin' && userProfile?.role !== 'restaurant_owner' && userProfile?.role !== 'manager') {
      navigate('/');
      return;
    }

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usersData = snapshot.docs.map(doc => doc.data() as UserProfile);
      setUsers(usersData);
      setLoadingUsers(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    const unsubPromos = onSnapshot(collection(db, 'promos'), (snapshot) => {
      const promosData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PromoCode[];
      setPromos(promosData.filter(p => p.active));
      setLoadingPromos(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'promos');
    });

    return () => {
      unsubUsers();
      unsubPromos();
    };
  }, [userProfile, navigate, loading]);

  const filteredUsers = users.filter(u => 
    u.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.phone?.includes(searchTerm) ||
    u.role.includes(searchTerm.toLowerCase())
  );

  const handleAssignPromo = async () => {
    if (!selectedUser || !selectedPromoId) return;

    try {
      const promoRef = doc(db, 'promos', selectedPromoId);
      await updateDoc(promoRef, {
        assignedTo: arrayUnion(selectedUser.uid)
      });
      setIsAssigningPromo(false);
      setSelectedPromoId('');
      alert(`Promo ${selectedPromoId} assigned to ${selectedUser.name || selectedUser.email}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `promos/${selectedPromoId}`);
    }
  };

  const [promoToRemove, setPromoToRemove] = useState<{ promoId: string, userId: string } | null>(null);
  const [roleToChange, setRoleToChange] = useState<{ userId: string, newRole: UserRole } | null>(null);

  const handleRemovePromo = async (promoId: string, userId: string) => {
    setPromoToRemove({ promoId, userId });
  };

  const confirmRemovePromo = async () => {
    if (!promoToRemove) return;
    const { promoId, userId } = promoToRemove;
    try {
      const promoRef = doc(db, 'promos', promoId);
      await updateDoc(promoRef, {
        assignedTo: arrayRemove(userId)
      });
      setPromoToRemove(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `promos/${promoId}`);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewUserError('');
    setIsCreating(true);

    try {
      // Initialize a secondary Firebase app to create the user without signing out the admin
      let secondaryApp;
      if (getApps().length === 0) {
        // This shouldn't happen as the primary app is already initialized, but just in case
        secondaryApp = initializeApp(firebaseConfig, 'SecondaryApp');
      } else {
        const apps = getApps();
        const existingApp = apps.find(app => app.name === 'SecondaryApp');
        if (existingApp) {
          secondaryApp = existingApp;
        } else {
          secondaryApp = initializeApp(firebaseConfig, 'SecondaryApp');
        }
      }
      const secondaryAuth = getAuth(secondaryApp);

      // Create the user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newUserEmail, newUserPassword);
      const newUid = userCredential.user.uid;

      // Create the user document in Firestore using the primary db instance
      // We first create it as 'customer' because the security rules require the new user to create themselves as 'customer'
      // Wait, the secondary app is authenticated as the new user, but we are using the primary `db` which is authenticated as the admin!
      // So the `db` instance will create the document as the admin.
      // The rule says: allow create: if isAuthenticated() && isValidUser(request.resource.data) && ((isOwner(userId) && request.resource.data.role == 'customer') || isAdmin());
      // Since we use the primary `db`, `isAdmin()` is true, so we can set the role directly!
      
      const newUserProfile: any = {
        uid: newUid,
        email: newUserEmail,
        role: newUserRole,
        createdAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'users', newUid), newUserProfile);

      // Sign out and delete the secondary app
      await secondaryAuth.signOut();
      await deleteApp(secondaryApp);
      
      setIsCreatingUser(false);
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserRole('staff');
      // alert('User created successfully!');
    } catch (error: any) {
      console.error('Error creating user:', error);
      setNewUserError(error.message || 'Failed to create user.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    setRoleToChange({ userId, newRole });
  };

  const confirmRoleChange = async () => {
    if (!roleToChange) return;
    const { userId, newRole } = roleToChange;
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
      setRoleToChange(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  if (loading || loadingUsers || loadingPromos) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
      </div>
    );
  }

  if (userProfile?.role !== 'admin' && userProfile?.role !== 'restaurant_owner' && userProfile?.role !== 'manager') return null;

  return (
    <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 sm:p-8 rounded-[2rem] shadow-ios-sm border border-gray-100 gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-black mb-2">Users & Customers</h1>
          <p className="text-gray-500 text-base sm:text-lg">Manage users, roles, and assign promos.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setIsCreatingUser(true)}
            className="bg-black hover:bg-gray-900 text-[#EADDC5] px-5 py-2.5 rounded-2xl font-medium transition-colors shadow-ios-sm flex items-center gap-2"
          >
            <UserPlus size={18} />
            Create User
          </button>
          <Link to="/admin" className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-2.5 rounded-2xl font-medium transition-colors shadow-ios-sm">
            Back to Dashboard
          </Link>
        </div>
      </div>

      <div className="bg-white p-4 sm:p-8 rounded-[2rem] shadow-ios-sm border border-gray-100 mb-6 sm:mb-8">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input 
            type="text" 
            placeholder="Search users by name, email, phone, or role..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 sm:py-4 rounded-2xl border border-gray-200 focus:ring-2 focus:ring-black focus:border-black outline-none transition-all text-sm sm:text-base"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-10">
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
          {filteredUsers.length === 0 ? (
            <div className="bg-white p-8 sm:p-12 rounded-[2rem] shadow-ios-sm border border-gray-100 text-center text-gray-500 text-base sm:text-lg">
              No users found.
            </div>
          ) : (
            filteredUsers.map(user => (
              <div 
                key={user.uid} 
                className={`bg-white p-5 sm:p-8 rounded-[2rem] shadow-ios-sm border transition-colors cursor-pointer ${selectedUser?.uid === user.uid ? 'border-black ring-1 ring-black' : 'border-gray-100 hover:border-gray-300'}`}
                onClick={() => setSelectedUser(user)}
              >
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-600 font-bold text-xl">
                      {user.name ? user.name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-lg text-black">{user.name || 'No Name Provided'}</h3>
                        <span className={`px-2 py-0.5 rounded-xl text-xs font-medium uppercase tracking-wider ${
                          user.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                          user.role === 'restaurant_owner' ? 'bg-blue-100 text-blue-800' :
                          user.role === 'manager' ? 'bg-indigo-100 text-indigo-800' :
                          user.role === 'staff' ? 'bg-gray-200 text-gray-800' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {user.role.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-1 sm:gap-4 text-sm text-gray-500 mt-1">
                        <span className="flex items-center gap-1"><Mail size={14} /> {user.email}</span>
                        {user.phone && <span className="flex items-center gap-1"><Phone size={14} /> {user.phone}</span>}
                      </div>
                    </div>
                  </div>
                  
                  {user.role === 'customer' && (
                    <div className="flex gap-4 text-sm font-medium text-gray-700">
                      <div className="flex flex-col items-end">
                        <span className="text-gray-400 text-xs uppercase tracking-wider">Orders</span>
                        <span className="flex items-center gap-1"><ShoppingBag size={14} className="text-black" /> {user.totalOrders || 0}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-gray-400 text-xs uppercase tracking-wider">Spent</span>
                        <span className="flex items-center gap-1"><DollarSign size={14} className="text-black" /> {(user.totalSpent || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Role Management */}
                {['admin', 'restaurant_owner', 'manager'].includes(userProfile?.role || '') && user.uid !== userProfile?.uid && (
                  <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-3">
                    <Shield size={16} className="text-gray-400" />
                    <span className="text-sm text-gray-600 font-medium">Change Role:</span>
                    <select 
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.uid, e.target.value as UserRole)}
                      className="text-sm border border-gray-200 rounded-xl px-2 py-1 bg-gray-50 focus:ring-2 focus:ring-black outline-none"
                      onClick={(e) => e.stopPropagation()}
                      disabled={
                        (userProfile?.role === 'manager' && !['staff', 'customer'].includes(user.role)) ||
                        (userProfile?.role === 'restaurant_owner' && !['manager', 'staff', 'customer'].includes(user.role))
                      }
                    >
                      <option value="customer">Customer</option>
                      <option value="driver">Driver</option>
                      <option value="staff">Staff</option>
                      {['admin', 'restaurant_owner'].includes(userProfile?.role || '') && <option value="manager">Manager</option>}
                      {userProfile?.role === 'admin' && <option value="restaurant_owner">Restaurant Owner</option>}
                      {userProfile?.role === 'admin' && <option value="admin">Admin</option>}
                    </select>
                  </div>
                )}

                {/* Display assigned promos for this user */}
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Assigned Promos</h4>
                  <div className="flex flex-wrap gap-2">
                    {promos.filter(p => p.assignedTo?.includes(user.uid)).length > 0 ? (
                      promos.filter(p => p.assignedTo?.includes(user.uid)).map(promo => (
                        <span key={promo.id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-medium bg-gray-100 text-black border border-gray-200">
                          <Tag size={12} /> {promo.id}
                          <button onClick={(e) => { e.stopPropagation(); handleRemovePromo(promo.id, user.uid); }} className="ml-1 hover:text-red-600">
                            <X size={12} />
                          </button>
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-gray-400 italic">No promos assigned</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="lg:col-span-1">
          <div className="bg-white p-6 sm:p-8 rounded-[2rem] shadow-ios-sm border border-gray-100 sticky top-24">
            <h2 className="text-xl font-bold text-black mb-6">Assign Promo Code</h2>
            
            {!selectedUser ? (
              <div className="text-center p-6 bg-gray-50 rounded-2xl text-gray-500 text-sm">
                Select a user from the list to assign a promo code.
              </div>
            ) : (
              <div className="space-y-6">
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-1">Selected User</p>
                  <p className="font-medium text-black truncate">{selectedUser.name || selectedUser.email}</p>
                </div>
                
                {isAssigningPromo ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Select Promo Code</label>
                      <select 
                        value={selectedPromoId}
                        onChange={(e) => setSelectedPromoId(e.target.value)}
                        className="w-full border border-gray-200 rounded-2xl p-3 focus:ring-2 focus:ring-black outline-none"
                      >
                        <option value="">-- Select a promo --</option>
                        {promos.filter(p => !p.assignedTo?.includes(selectedUser.uid)).map(promo => (
                          <option key={promo.id} value={promo.id}>
                            {promo.id} ({promo.discountType === 'percentage' ? `${promo.discountValue}%` : `$${promo.discountValue}`})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={handleAssignPromo}
                        disabled={!selectedPromoId}
                        className="flex-1 bg-black hover:bg-gray-900 text-[#EADDC5] py-2.5 rounded-2xl font-medium transition-colors disabled:opacity-50 shadow-ios-sm"
                      >
                        Assign
                      </button>
                      <button 
                        onClick={() => setIsAssigningPromo(false)}
                        className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-2xl font-medium transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button 
                    onClick={() => setIsAssigningPromo(true)}
                    className="w-full bg-black hover:bg-gray-900 text-[#EADDC5] py-3 rounded-2xl font-medium transition-colors flex items-center justify-center gap-2 shadow-ios-sm"
                  >
                    <Tag size={18} /> Assign New Promo
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create User Modal */}
      {isCreatingUser && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2rem] p-6 sm:p-8 max-w-md w-full shadow-ios-lg">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-black">Create New User</h2>
              <button onClick={() => setIsCreatingUser(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleCreateUser} className="space-y-4">
              {newUserError && (
                <div className="p-3 bg-red-50 text-red-700 rounded-2xl text-sm border border-red-100">
                  {newUserError}
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <input 
                  type="email" 
                  required
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="w-full border border-gray-200 rounded-2xl p-3 focus:ring-2 focus:ring-black outline-none"
                  placeholder="user@example.com"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input 
                  type="password" 
                  required
                  minLength={6}
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  className="w-full border border-gray-200 rounded-2xl p-3 focus:ring-2 focus:ring-black outline-none"
                  placeholder="Minimum 6 characters"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select 
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                  className="w-full border border-gray-200 rounded-2xl p-3 focus:ring-2 focus:ring-black outline-none"
                >
                  <option value="customer">Customer</option>
                  <option value="driver">Driver</option>
                  <option value="staff">Staff</option>
                  {['admin', 'restaurant_owner'].includes(userProfile?.role || '') && <option value="manager">Manager</option>}
                  {userProfile?.role === 'admin' && <option value="restaurant_owner">Restaurant Owner</option>}
                  {userProfile?.role === 'admin' && <option value="admin">Admin</option>}
                </select>
              </div>
              
              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsCreatingUser(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-2xl font-medium transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isCreating}
                  className="flex-1 bg-black hover:bg-gray-900 text-[#EADDC5] py-3 rounded-2xl font-medium transition-colors disabled:opacity-50 shadow-ios-sm"
                >
                  {isCreating ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Remove Promo Modal */}
      {promoToRemove && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-[2rem] p-6 sm:p-8 max-w-md w-full shadow-ios-lg">
            <h3 className="text-2xl font-bold text-black mb-4">Remove Promo</h3>
            <p className="text-gray-500 mb-6">
              Are you sure you want to remove promo code "{promoToRemove.promoId}" from this user?
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setPromoToRemove(null)}
                className="flex-1 px-4 py-3 rounded-2xl font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmRemovePromo}
                className="flex-1 px-4 py-3 rounded-2xl font-medium text-[#EADDC5] bg-red-600 hover:bg-red-700 transition-colors shadow-ios-sm"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Role Modal */}
      {roleToChange && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-[2rem] p-6 sm:p-8 max-w-md w-full shadow-ios-lg">
            <h3 className="text-2xl font-bold text-black mb-4">Change Role</h3>
            <p className="text-gray-500 mb-6">
              Are you sure you want to change this user's role to <span className="font-bold text-black">{roleToChange.newRole}</span>?
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setRoleToChange(null)}
                className="flex-1 px-4 py-3 rounded-2xl font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmRoleChange}
                className="flex-1 px-4 py-3 rounded-2xl font-medium text-[#EADDC5] bg-black hover:bg-gray-900 transition-colors shadow-ios-sm"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

