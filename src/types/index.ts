// User Types
import type { NavigatorScreenParams } from '@react-navigation/native';
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  avatar?: string;
  dateOfBirth?: string;
  gender?: 'male' | 'female' | 'other';
  loyaltyPoints: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserAddress {
  id: string;
  userId: string;
  type: 'home' | 'work' | 'other';
  firstName: string;
  lastName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  isDefault: boolean;
}

/** Customer Address row from ERPNext (used by Address book / editor navigation). */
export interface ErpCustomerAddressRow {
  name?: string;
  address_title: string;
  address_type?: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  county?: string;
  state?: string;
  country?: string;
  pincode?: string;
  email_id?: string;
  phone?: string;
  is_primary_address?: boolean | number;
  is_shipping_address?: boolean | number;
  disabled?: boolean | number;
}

// Product Types
export interface ProductSpecification {
  label: string;
  description: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  discountPercentage?: number;
  category: string;
  subcategory: string;
  brand: string;
  company?: string;
  images: string[]; // For listings - uses website_image
  slideshowImages?: string[]; // For detail page - uses slideshow field
  colors: ProductColor[];
  sizes: ProductSize[];
  specifications?: ProductSpecification[]; // Website Specifications table (Label, Description)
  inStock: boolean;
  rating: number;
  reviewCount: number;
  tags: string[];
  isNew: boolean;
  isTrending: boolean;
  isOnSale: boolean;
  createdAt: string;
  updatedAt: string;
  itemCode?: string; // Item doctype code (from Website Item's item_code field)
}

export interface ProductColor {
  id: string;
  name: string;
  hexCode: string;
  inStock: boolean;
}

export interface ProductSize {
  id: string;
  name: string;
  inStock: boolean;
}

export interface ProductReview {
  id: string;
  productId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  rating: number;
  title: string;
  comment: string;
  images?: string[];
  helpfulCount: number;
  createdAt: string;
}

// Cart Types
export interface CartItem {
  id: string;
  productId: string;
  product: Product;
  color: ProductColor;
  size: ProductSize;
  quantity: number;
  price: number;
}

export interface Cart {
  id: string;
  userId: string;
  items: CartItem[];
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  updatedAt: string;
}

// Order Types
export interface Order {
  id: string;
  userId: string;
  orderNumber: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  shipping: number;
  discount: number;
  total: number;
  shippingAddress: UserAddress;
  billingAddress: UserAddress;
  paymentMethod: PaymentMethod;
  trackingNumber?: string;
  estimatedDelivery?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  productId: string;
  product: Product;
  color: ProductColor;
  size: ProductSize;
  quantity: number;
  price: number;
}

// Sales Invoice Types
export interface SalesInvoice {
  id: string;
  invoiceNumber: string;
  customer: string;
  date: string;
  postingTime?: string;
  grandTotal: number;
  status: string;
  items: SalesInvoiceItem[];
}

export interface SalesInvoiceItem {
  itemCode: string;
  itemName?: string;
  quantity: number;
  rate: number;
  amount: number;
}

export type OrderStatus = 
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'to_deliver'
  | 'completed'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'returned';

// Flyer Types
export interface Flyer {
  name: string;
  flyer_name: string;
  image: string | null;
  description?: string;
}

// Payment Types
export interface PaymentMethod {
  id: string;
  userId: string;
  type: 'card' | 'paypal' | 'apple_pay' | 'google_pay';
  last4?: string;
  brand?: string;
  isDefault: boolean;
  expiryMonth?: number;
  expiryYear?: number;
}

// Wishlist Types
export interface WishlistItem {
  id: string;
  userId: string;
  productId: string;
  product: Product;
  createdAt: string;
}

// Category Types
export interface Category {
  id: string;
  name: string;
  slug: string;
  image: string;
  description?: string;
  parentId?: string;
  subcategories?: Category[];
}


export type SupplierStackParamList = {
  SupplierTabs: undefined;
  SupplierOrdersInvoices: undefined;
  SupplierSalesInvoiceDetail: { name: string };
  SupplierPaymentEntryDetail: { name: string };
  SupplierQuotationList: { initialTab?: 'list' | 'new' } | undefined;
  SupplierQuotationDetail: { name: string };
};

export type SupplierTabParamList = {
  SupplierHome: undefined;
  SupplierMessages: undefined;
  SupplierProfile: undefined;
};

// Navigation Types

export type MainTabParamList = {
  Home: undefined;
  Categories: undefined;
  Sourcing: undefined;
  /** Native Raven chat (Suppliers tab); optional params when opening a DM from supplier profile. */
  Suppliers:
    | {
        openRavenWorkspaceId?: string;
        openRavenChannelId?: string;
        /** Frappe user id — used to build a DM row if the channel is not in the list yet (same as in-drawer “new DM”). */
        openRavenPeerUserId?: string;
      }
    | undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Splash: undefined;
  LanguageSelect: { fromSettings?: boolean } | undefined;
  Onboarding: undefined;
  Auth: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  SourcingRequest: {
    parentCategory?: string;
    parentCategoryId?: string;
    subCategory?: string;
    subCategoryId?: string;
  } | undefined;
  Search: { query?: string };
  OrderHistory: undefined;
  /** Buyer: sales invoices & payment entries for the logged-in customer. */
  InvoicesPayments: undefined;
  OrderDetails: { orderId: string };
  InvoiceDetails: { invoiceId: string };
  PaymentEntryDetail: { name: string };
  EditProfile: undefined;
  Settings: undefined;
  AddressBook: undefined;
  EditAddress: { address?: ErpCustomerAddressRow; returnTo?: string } | undefined;
  Suppliers: undefined;
  SupplierDetail: { supplierId: string };
  AgentSupplierChat: { supplierId: string };
  SupplierChatList: undefined;
  /** Draft SQ + Raven doc link. Omit `ravenChannelId` to pick any chat/channel on the compose screen. */
  SupplierQuotationCompose: { ravenChannelId?: string } | undefined;
  /** Native Raven-style chat (light UI); not a WebView. */
  RavenUIMessages: undefined;
  /** Header chat icon: your channels & people you message (not the Suppliers tab). */
  RavenChatInbox: { openWorkspaceId?: string; openChannelId?: string } | undefined;
  RavenWorkspaceSupplierProfile: {
    supplierDocName: string;
    workspaceAdminUser?: string;
    /** Raven workspace `name` — required to return to in-app chat after opening a DM. */
    ravenWorkspaceId?: string;
  };
  Subscription: undefined;
  /** Contact form → ERPNext Issue (Support). */
  ContactUs: undefined;
  /** Screen-by-screen help; `scope` selects buyer vs supplier copy. */
  Faq: { scope?: 'buyer' | 'supplier' } | undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  RegisterConsent: undefined;
  PrivacyPolicy: undefined;
  TermsAndConditions: undefined;
  ForgotPassword: undefined;
};

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
