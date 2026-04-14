// User Types
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

// Navigation Types
export type RootStackParamList = {
  Splash: undefined;
  Onboarding: undefined;
  Auth: undefined;
  Main: undefined;
  SourcingRequest: { parentCategory?: string; subCategory?: string } | undefined;
  ProductDetails: { productId: string };
  CategoryProducts: { categoryName: string; parentName: string };
  AllDeals: { deals: Product[] };
  PricingRules: undefined;
  ProductBundles: undefined;
  Search: { query?: string };
  Wishlist: undefined;
  Cart: undefined;
  Checkout: undefined;
  OrderSuccess: { orderId?: string };
  OrderHistory: undefined;
  OrderDetails: { orderId: string };
  InvoiceDetails: { invoiceId: string };
  EditProfile: undefined;
  Settings: undefined;
  CreateBundle: undefined;
  ViewBundle: { bundle: any };
};

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Categories: undefined;
  Sourcing: undefined;
  Profile: undefined;
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
