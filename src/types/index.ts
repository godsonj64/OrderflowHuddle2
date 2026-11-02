export type UserRole = 'admin' | 'restaurant_owner' | 'manager' | 'staff' | 'driver' | 'customer';

/** Roles that can manage the business (menu, settings, promos, users, refunds). */
export const MANAGER_ROLES: UserRole[] = ['admin', 'restaurant_owner', 'manager'];
/** Roles that can run day-to-day operations (orders, kitchen, cash collection). */
export const STAFF_ROLES: UserRole[] = [...MANAGER_ROLES, 'staff'];

export const isManagerRole = (role?: UserRole | null) => !!role && MANAGER_ROLES.includes(role);
export const isStaffRole = (role?: UserRole | null) => !!role && STAFF_ROLES.includes(role);

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
  /** Set on cart / order lines so the kitchen sees which group a choice belongs to. */
  groupId?: string;
  groupName?: string;
}

export interface ModifierGroup {
  id: string;
  name: string;
  minSelection: number;
  /** 0 means "no limit". */
  maxSelection: number;
  modifiers: Modifier[];
  required: boolean;
}

export interface DayHours {
  open: string;
  close: string;
  closed: boolean;
  hasSecondSlot?: boolean;
  open2?: string;
  close2?: string;
}

export type BusinessHours = Record<string, DayHours>;

export type MenuLayout = 'grid' | 'list' | 'compact';
export type HeroStyle = 'image' | 'minimal' | 'none';
export type CornerStyle = 'sharp' | 'rounded' | 'pill';
export type SurfaceMode = 'light' | 'warm' | 'dark';
export type AnnouncementTone = 'brand' | 'info' | 'warning' | 'success';

/** Owner-controlled storefront look & feel. Every field is optional; defaults live in src/lib/theme.ts. */
export interface StorefrontTheme {
  preset?: string;
  brandColor?: string;
  accentColor?: string;
  mode?: SurfaceMode;
  font?: string;
  corners?: CornerStyle;
  menuLayout?: MenuLayout;
  heroStyle?: HeroStyle;
  heroHeight?: 'compact' | 'tall';
  heroOverlay?: number; // 0-90 (%)
  tagline?: string;
  showSearch?: boolean;
  showFeatured?: boolean;
  featuredTitle?: string;
  showRatings?: boolean;
  showPrepTime?: boolean;
  showCalories?: boolean;
  showPoweredBy?: boolean;
  spotlightTitle?: string;
  spotlightSubtitle?: string;
  announcementEnabled?: boolean;
  announcementText?: string;
  announcementTone?: AnnouncementTone;
}

export interface SocialLinks {
  instagram?: string;
  tiktok?: string;
  facebook?: string;
  website?: string;
  maps?: string;
}

export interface RestaurantProfile {
  name: string;
  isAcceptingOrders: boolean;
  isDeliveryEnabled?: boolean;
  isPickupEnabled?: boolean;
  /** Allows customers to schedule orders for later (pickup and delivery). Field name kept for backwards compatibility. */
  isSchedulePickupEnabled?: boolean;
  scheduleDaysAhead?: number;
  description?: string;
  address?: string;
  phone?: string;
  email?: string;
  deliveryFee?: number;
  freeDeliveryThreshold?: number;
  minimumOrder?: number;
  serviceFeePercent?: number;
  /** Waives the service fee while a promotion is running. */
  promotionalZeroFee?: boolean;
  taxRate?: number;
  isCardPaymentEnabled?: boolean;
  isCashPaymentEnabled?: boolean;
  isTippingEnabled?: boolean;
  estimatedPrepMinutes?: number;
  /** Busy mode: ASAP orders are paused until this time. Firestore Timestamp. */
  pausedUntil?: any;
  /** IANA time zone used for business hours, e.g. "America/Chicago". */
  timezone?: string;
  logoUrl?: string;
  bannerUrl?: string;
  businessHours?: BusinessHours;
  isMarqueeEnabled?: boolean;
  marqueeText?: string;
  marqueeImageUrl?: string;
  marqueeImageUrls?: string[];
  isGalleryEnabled?: boolean;
  galleryImageUrls?: string[];
  averageRating?: number;
  totalRatings?: number;
  theme?: StorefrontTheme;
  social?: SocialLinks;
}

export interface MenuCategory {
  id: string;
  name: string;
  displayOrder: number;
  active: boolean;
  imageUrl?: string | null;
  description?: string;
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  basePrice: number;
  active: boolean;
  /** Still shown on the menu, but cannot be ordered (e.g. ran out today). */
  isSoldOut?: boolean;
  /** Pinned to the featured row at the top of the menu. */
  isFeatured?: boolean;
  displayOrder?: number;
  description?: string;
  imageUrl?: string;
  dietaryTags?: string[];
  preparationTime?: number; // in minutes
  calories?: number;
  modifierGroups?: ModifierGroup[];
  sizeVariants?: { name: string; priceAdjustment: number }[];
  rating?: number;
  ratingCount?: number;
  /** Maintained by the server when orders are placed. */
  soldCount?: number;
}

export interface CartItem {
  cartItemId: string;
  itemId: string;
  name: string;
  /** Unit price including modifiers. */
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
  expiresAt?: any; // Firestore Timestamp
  active: boolean;
  usageLimit?: number;
  usedCount: number;
  usedBy: string[]; // Array of user UIDs who have used it
  assignedTo?: string[]; // Array of user UIDs. If empty/undefined, open to all.
  minOrders?: number; // Segmentation: min orders required
  minSpent?: number; // Segmentation: min lifetime spend required
  minSubtotal?: number; // Minimum basket subtotal for this order
  description?: string;
  createdAt: any; // Firestore Timestamp
}

export type OrderStatus =
  | 'payment_pending'
  | 'new'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'completed'
  | 'cancelled';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'partially_refunded';
export type PaymentMethod = 'card' | 'cash';
export type OrderType = 'pickup' | 'delivery';

export interface Order {
  id: string;
  /** Short, human friendly code shown to customers and the kitchen. */
  orderNumber?: string;
  customerId: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  items: CartItem[];
  status: OrderStatus;
  total: number;
  subtotal?: number;
  deliveryFee?: number;
  serviceFee?: number;
  tax?: number;
  restaurantTip?: number;
  deliveryTip?: number;
  promoCode?: string;
  discountAmount?: number;
  type: OrderType;
  /** Human readable scheduled time in the restaurant's time zone. */
  scheduledTime?: string;
  /** Firestore Timestamp of the scheduled pickup / delivery time. */
  scheduledFor?: any;
  deliveryAddress?: string;
  notes?: string;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  paymentIntentId?: string;
  paidAt?: any;
  /** Name of the staff member / driver who recorded a cash payment. */
  paymentCollectedBy?: string;
  refundAmount?: number;
  cancelReason?: string;
  cancelledBy?: 'customer' | 'staff' | 'system';
  rating?: number;
  ratingComment?: string;
  driverId?: string;
  driverName?: string;
  deliveryStatus?: 'pending' | 'assigned' | 'picked_up' | 'delivered';
  proofOfDeliveryImage?: string;
  createdAt: any; // Firestore Timestamp
  updatedAt?: any;
}
