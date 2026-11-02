export type UserRole = 'admin' | 'restaurant_owner' | 'manager' | 'staff' | 'driver' | 'customer';

export interface UserProfile {
  uid: string;
  email: string;
  role: UserRole;
  name?: string;
  phone?: string;
  savedAddresses?: string[];
  totalOrders?: number;
  totalSpent?: number;
  loyaltyPoints?: number;
  lastOrderDate?: any; // Firestore Timestamp
  createdAt?: any; // Firestore Timestamp
}

export interface Modifier {
  id: string;
  name: string;
  price: number;
  allergenTags?: string[];
}

export interface ModifierGroup {
  id: string;
  name: string;
  minSelection: number;
  maxSelection: number;
  modifiers: Modifier[];
  required: boolean;
}

export interface RestaurantProfile {
  name: string;
  isAcceptingOrders: boolean;
  isDeliveryEnabled?: boolean;
  isPickupEnabled?: boolean;
  isSchedulePickupEnabled?: boolean;
  description?: string;
  address?: string;
  phone?: string;
  email?: string;
  deliveryFee?: number;
  minimumOrder?: number;
  promotionalZeroFee?: boolean;
  logoUrl?: string;
  bannerUrl?: string;
  taxRate?: number;
  businessHours?: {
    [day: string]: { 
      open: string; 
      close: string; 
      closed: boolean;
      hasSecondSlot?: boolean;
      open2?: string;
      close2?: string;
    };
  };
  isMarqueeEnabled?: boolean;
  marqueeText?: string;
  marqueeImageUrl?: string;
  marqueeImageUrls?: string[];
  isGalleryEnabled?: boolean;
  galleryImageUrls?: string[];
  averageRating?: number;
  totalRatings?: number;
}

export interface MenuCategory {
  id: string;
  name: string;
  displayOrder: number;
  active: boolean;
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  basePrice: number;
  active: boolean;
  description?: string;
  imageUrl?: string;
  dietaryTags?: string[];
  preparationTime?: number; // in minutes
  calories?: number;
  modifierGroups?: ModifierGroup[];
  sizeVariants?: { name: string; priceAdjustment: number }[];
  rating?: number;
  ratingCount?: number;
}

export interface CartItem {
  cartItemId: string;
  itemId: string;
  name: string;
  price: number;
  quantity: number;
  selectedModifiers: Modifier[];
  prepNotes?: string;
  kdsStatus?: 'new' | 'accepted' | 'cooking' | 'ready';
}

export interface PromoCode {
  id: string; // The promo code string, e.g., "SUMMER20"
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  expiresAt: any; // Firestore Timestamp
  active: boolean;
  usageLimit?: number;
  usedCount: number;
  usedBy: string[]; // Array of user UIDs who have used it
  assignedTo?: string[]; // Array of user UIDs. If empty/undefined, open to all.
  minOrders?: number; // Segmentation: min orders required
  minSpent?: number; // Segmentation: min total spent required
  createdAt: any; // Firestore Timestamp
}

export interface Order {
  id: string;
  customerId: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  items: CartItem[];
  status: 'new' | 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery' | 'completed' | 'cancelled';
  total: number;
  subtotal?: number;
  deliveryFee?: number;
  serviceFee?: number;
  promoCode?: string;
  discountAmount?: number;
  type: 'pickup' | 'delivery';
  scheduledTime?: string;
  deliveryAddress?: string;
  notes?: string;
  paymentStatus?: 'pending' | 'paid' | 'failed' | 'refunded' | 'partially_refunded';
  paymentIntentId?: string;
  refundAmount?: number;
  rating?: number;
  ratingComment?: string;
  driverId?: string;
  driverName?: string;
  deliveryStatus?: 'pending' | 'assigned' | 'picked_up' | 'delivered';
  proofOfDeliveryImage?: string;
  createdAt: any; // Firestore Timestamp
}
