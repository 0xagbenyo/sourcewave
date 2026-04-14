/**
 * ERPNext Integration Service
 * 
 * This service handles all communication with ERPNext backend.
 * Supports multi-company setup with shared customers.
 * 
 * For Website Item field reference, see: src/services/websiteItemFields.ts
 * Use getWebsiteItemAllFields() to fetch all fields from a Website Item for reference.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

// Configuration
const ERPNEXT_BASE_URL = process.env.EXPO_PUBLIC_ERPNEXT_URL || 'http://localhost:8000';
const API_VERSION = '/api/resource';

// Fixed timeout for all API calls
// Recommended: 15000ms (15s) for cloud/remote ERPNext
// Override via EXPO_PUBLIC_ERPNEXT_TIMEOUT environment variable if needed
const FIXED_TIMEOUT = process.env.EXPO_PUBLIC_ERPNEXT_TIMEOUT 
  ? parseInt(process.env.EXPO_PUBLIC_ERPNEXT_TIMEOUT, 10) 
  : 15000; // 15 seconds - same for all API calls

// Network state management for retry logic
let networkState: {
  isConnected: boolean | null;
  networkType: string | null;
} = {
  isConnected: null,
  networkType: null,
};

let networkListener: (() => void) | null = null;

/**
 * Check if network is stable (connected and not slow)
 * Used for retry logic
 */
const isNetworkStable = (): boolean => {
  if (networkState.isConnected === false) {
    return false;
  }
  
  // Consider network stable if connected (regardless of type)
  // We'll retry if network is connected
  return networkState.isConnected === true;
};

/**
 * Initialize network monitoring for retry logic
 * This monitors network state to determine if retries should be attempted
 * 
 * Note: Requires @react-native-community/netinfo package
 * Install with: npm install @react-native-community/netinfo
 * If not installed, will assume network is always stable for retries
 */
export const initializeNetworkAwareTimeout = async () => {
  try {
    // Dynamically import NetInfo to avoid issues if not installed
    // Note: @react-native-community/netinfo is optional
    // Install with: npm install @react-native-community/netinfo
    let NetInfo: any = null;
    try {
      // @ts-ignore - NetInfo is optional, handled gracefully if not installed
      NetInfo = await import('@react-native-community/netinfo');
    } catch (importError) {
      console.warn('NetInfo not available. Install with: npm install @react-native-community/netinfo');
      console.warn('Using fixed timeout:', FIXED_TIMEOUT, 'ms');
      // Assume network is stable if NetInfo not available
      networkState = { isConnected: true, networkType: 'unknown' };
      return;
    }
    
    if (!NetInfo || !NetInfo.default) {
      console.warn('NetInfo not available. Using fixed timeout:', FIXED_TIMEOUT);
      networkState = { isConnected: true, networkType: 'unknown' };
      return;
    }

    // Get initial network state
    const state = await NetInfo.default.fetch();
    networkState = {
      networkType: state?.type || null,
      isConnected: state?.isConnected ?? null,
    };
    
    console.log(`Network detected: ${networkState.networkType}, Connected: ${networkState.isConnected}, Timeout: ${FIXED_TIMEOUT}ms`);

    // Listen for network state changes
    networkListener = NetInfo.default.addEventListener((state: any) => {
      const networkType = state?.type || null;
      const isConnected = state?.isConnected ?? null;
      
      const wasConnected = networkState.isConnected;
      networkState = { networkType, isConnected };
      
      if (wasConnected !== isConnected) {
        console.log(`Network changed: ${networkType}, Connected: ${isConnected}`);
      }
    });
  } catch (error) {
    console.warn('Failed to initialize network monitoring:', error);
    // Assume network is stable for retries
    networkState = { isConnected: true, networkType: 'unknown' };
  }
};

/**
 * Cleanup network listener
 */
export const cleanupNetworkAwareTimeout = () => {
  if (networkListener) {
    networkListener();
    networkListener = null;
  }
};

/**
 * Get fixed timeout value (same for all API calls)
 */
export const getCurrentTimeout = (): number => {
  return FIXED_TIMEOUT;
};

// Base64 encoding utility for React Native
// Note: React Native doesn't have btoa by default
// If btoa is not available, you may need to install: npm install base-64
// and use: import { encode } from 'base-64'; encode(credentials)
const base64Encode = (str: string): string => {
  if (typeof btoa !== 'undefined') {
    return btoa(str);
  }
  // Fallback: simple base64 implementation for React Native
  // For production, consider using the 'base-64' package
  try {
    // @ts-ignore - btoa may be polyfilled
    return btoa(str);
  } catch (e) {
    // If btoa is not available, throw an error suggesting to install base-64
    throw new Error(
      'Base64 encoding not available. Please install base-64: npm install base-64'
    );
  }
};

// Types
export interface ERPNextConfig {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
  defaultCompany?: string;
  defaultPriceList?: string; // Default price list for fetching prices
}

export interface ERPNextResponse<T> {
  data: T;
}

export interface ERPNextListResponse<T> {
  data: T[];
  keys: string[];
}

export interface ERPNextError {
  status?: number;
  message?: string;
  exc?: string;
  exc_type?: string;
  exception?: string;
  [key: string]: any; // Allow other properties
}

/**
 * Legacy filters targeted `Website Item`. Catalog + images use the `Item` doctype instead.
 */
function mapWebsiteItemFiltersToItem(filters: any[][]): any[][] {
  const out: any[][] = [];
  for (const row of filters) {
    if (!Array.isArray(row) || row.length < 4) continue;
    const [dt, field, op, val] = row;
    if (dt !== 'Website Item') {
      out.push(row);
      continue;
    }
    if (field === 'published') {
      out.push(['Item', 'disabled', '=', val === 1 ? 0 : 1]);
      continue;
    }
    if (field === 'web_item_name') {
      out.push(['Item', 'item_name', op, val]);
      continue;
    }
    out.push(['Item', field, op, val]);
  }
  return out;
}

// API Client Class
class ERPNextClient {
  private client: AxiosInstance;
  private config: ERPNextConfig;

  constructor(config: ERPNextConfig) {
    this.config = config;
    // Create axios instance with dynamic timeout
    // Timeout will be updated based on network conditions
    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: getCurrentTimeout(), // Dynamic timeout based on network conditions
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      // DO NOT use withCredentials for resource API calls
      // Resource API calls should use API key/secret authentication, not session cookies
      withCredentials: false,
    });

    // Set fixed timeout for all requests (same for every API call)
    this.client.interceptors.request.use((config) => {
      // Use fixed timeout - same for all API calls regardless of network
      config.timeout = getCurrentTimeout();
      return config;
    });

    // Add authentication interceptor
    // IMPORTANT: Always use API key/secret for resource API calls
    // Do NOT use session cookies - login is separate from resource API access
    this.client.interceptors.request.use((config) => {
      // Always use API key authentication for resource API calls
      if (this.config.apiKey && this.config.apiSecret) {
        // Base64 encode credentials for Basic Auth
        const credentials = `${this.config.apiKey}:${this.config.apiSecret}`;
        const auth = base64Encode(credentials);
        config.headers.Authorization = `Basic ${auth}`;
      }
      // Ensure cookies are not sent with resource API calls
      config.withCredentials = false;
      return config;
    });

    // Add retry logic with error interceptor
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<ERPNextError>) => {
        const originalRequest = error.config as any;

        // Check if this is a retryable error and we haven't exceeded max retries
        // Only retry network/timeout errors, not server-side parsing errors (500 with JSONDecodeError)
        const errorData = error.response?.data as ERPNextError | undefined;
        const isJsonDecodeError = errorData?.exc_type === 'JSONDecodeError' || errorData?.exception?.includes('JSONDecodeError');
        const isRetryableError = 
          (error.code === 'ECONNABORTED' || // Timeout
          error.code === 'ECONNREFUSED' || // Connection refused
          error.code === 'ENOTFOUND' || // DNS error
          error.message === 'Network Error') && // Network error
          !isJsonDecodeError; // Don't retry JSON decode errors - these are server-side issues

        const maxRetries = 3;
        const retryCount = originalRequest._retryCount || 0;

        // Retry if: error is retryable, network is stable, and we haven't exceeded max retries
        if (isRetryableError && isNetworkStable() && retryCount < maxRetries) {
          originalRequest._retryCount = retryCount + 1;
          
          // Exponential backoff: wait 1s, 2s, 4s before retrying
          const delay = Math.pow(2, retryCount) * 1000;
          
          console.log(`Retrying request (attempt ${retryCount + 1}/${maxRetries}) after ${delay}ms:`, originalRequest.url);
          
          await new Promise(resolve => setTimeout(resolve, delay));
          
          // Retry the request
          return this.client(originalRequest);
        }

        // Better error logging for network errors
        if (error.code === 'ECONNABORTED' || error.message === 'Network Error') {
          console.error('ERPNext Network Error:', {
            message: error.message,
            code: error.code,
            url: error.config?.url,
            timeout: error.config?.timeout,
            retryCount,
            networkStable: isNetworkStable(),
          });
        } else if (error.response) {
          // Suppress "not found" errors - these are expected when items don't exist
          const errorData = error.response?.data as any;
          const serverMessages = errorData?._server_messages;
          const isNotFoundError = 
            errorData?.exc_type === 'DoesNotExistError' ||
            (typeof errorData === 'string' && errorData.includes('not found')) ||
            (serverMessages && 
              typeof serverMessages === 'string' && 
              (serverMessages as string).includes('not found'));
          
          if (!isNotFoundError) {
            console.error('ERPNext API Error:', errorData);
          }
        } else {
          console.error('ERPNext Request Error:', {
            message: error.message,
            code: error.code,
            url: error.config?.url,
            retryCount,
          });
        }
        
        throw error;
      }
    );
  }

  // AUTHENTICATION
  // Note: Login uses session-based auth (cookies) for user authentication
  // But resource API calls (/api/resource/*) should use API key/secret authentication
  
  async resetPassword(email: string): Promise<{ message?: string; [key: string]: any }> {
    try {
      // Use the admin reset_password endpoint with API key/secret authentication
      // This endpoint requires admin permissions and sends a password reset email to the user
      // The API key/secret must have admin permissions to use this endpoint
      // Using POST method as required by ERPNext for this endpoint
      const response = await this.client.post('/api/method/frappe.core.doctype.user.user.reset_password', {
        user: email.trim(),
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getTopCustomers(year?: number, month?: number): Promise<{
    month: string;
    year: string;
    top_customers: Array<{
      rank?: number;
      customer: string;
      total_sales: number;
      invoice_count?: number;
    }>;
    top_items: Array<{
      rank?: number;
      item_name: string;
      total_qty: number;
      image: string | null;
    }>;
  }> {
    try {
      const currentDate = new Date();
      const currentYear = year || currentDate.getFullYear();
      const currentMonth = month || (currentDate.getMonth() + 1);
      
      const response = await this.client.get('/api/method/get_monthly_leaderboard', {
        params: {
          year: currentYear.toString(),
          month: currentMonth.toString(),
        },
      });
      return response.data.message || response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async login(email: string, password: string): Promise<{ message?: string; full_name?: string; [key: string]: any }> {
    try {
      // Create a separate axios instance for login to avoid cookie interference
      // Login endpoint uses session-based authentication (cookies)
      const loginClient = axios.create({
        baseURL: this.config.baseUrl,
        timeout: getCurrentTimeout(),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        withCredentials: true, // Enable cookies for login only
      });

      // ERPNext password-based authentication endpoint
      // Uses /api/method/login with usr and pwd fields
      // ERPNext sets a session cookie after successful login
      const response = await loginClient.post('/api/method/login', {
        usr: email,
        pwd: password,
      });
      
      // Check if login was successful
      if (response.data && (response.data.message === 'Logged In' || response.data.message === 'No App')) {
        // Optionally verify the logged-in user
        try {
          const userInfoResponse = await loginClient.get('/api/method/frappe.auth.get_logged_user');
          console.log('User info response:', userInfoResponse.data);
          
          // Extract user info from response
          const userInfo = userInfoResponse?.data?.message;
          const userName = userInfo?.user || email;
          const fullName = userInfo?.full_name || userInfo?.name || undefined;
          
          return {
            ...response.data,
            user: userName,
            full_name: fullName,
          };
        } catch (userInfoError) {
          // If getting user info fails, still return login success
          console.warn('Login successful but could not fetch user info:', userInfoError);
          return {
            ...response.data,
            user: email,
            full_name: undefined,
          };
        }
      }
      
      return response.data;
    } catch (error: any) {
      // Extract meaningful error message from ERPNext response
      const errorMessage = this.extractLoginErrorMessage(error);
      const loginError = new Error(errorMessage);
      (loginError as any).originalError = error;
      throw loginError;
    }
  }

  private extractLoginErrorMessage(error: any): string {
    // Log full error for debugging
    console.error('Login error details:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message,
    });

    // Check for ERPNext login-specific error messages
    if (error.response?.data) {
      const responseData = error.response.data;
      
      // Check message field first
      if (responseData.message) {
        const message = responseData.message;
        // ERPNext login errors often come in the message field
        if (message && message !== 'Logged In') {
          // Common ERPNext login error messages
          if (message.includes('Invalid Login') || message.includes('Invalid User') || message.includes('Invalid Password')) {
            return 'Invalid email or password. Please check your credentials and try again.';
          }
          if (message.includes('Not Allowed')) {
            return 'Login not allowed. Please contact support.';
          }
          if (message.includes('User disabled')) {
            return 'Your account has been disabled. Please contact support.';
          }
          if (message.includes('Incorrect password')) {
            return 'Incorrect password. Please check your password and try again.';
          }
          return message;
        }
      }

      // Check exc_type for specific error types
      if (responseData.exc_type) {
        if (responseData.exc_type.includes('AuthenticationError') || responseData.exc_type.includes('InvalidLogin')) {
          return 'Invalid email or password. Please check your credentials and try again.';
        }
      }
    }

    // Check for ERPNext server messages
    if (error.response?.data?._server_messages) {
      try {
        const serverMessages = JSON.parse(error.response.data._server_messages);
        if (Array.isArray(serverMessages) && serverMessages.length > 0) {
          const firstMessage = JSON.parse(serverMessages[0]);
          if (firstMessage?.message) {
            return firstMessage.message;
          }
        }
      } catch (parseError) {
        // If parsing fails, try to extract message from string
        const serverMessages = error.response.data._server_messages;
        if (typeof serverMessages === 'string') {
          const match = serverMessages.match(/"message":\s*"([^"]+)"/);
          if (match && match[1]) {
            return match[1];
          }
        }
      }
    }

    // Check HTTP status codes
    if (error.response?.status === 401) {
      // For 401, try to get more specific error message
      const responseData = error.response?.data;
      if (responseData) {
        // Check if there's a specific error message
        if (responseData.message && responseData.message !== 'Logged In') {
          return responseData.message;
        }
        // Check exc for error details
        if (responseData.exc) {
          try {
            const excMessages = JSON.parse(responseData.exc);
            if (Array.isArray(excMessages) && excMessages.length > 0) {
              const excText = excMessages[0];
              if (excText.includes('Invalid Login') || excText.includes('Invalid User') || excText.includes('Invalid Password')) {
                return 'Invalid email or password. Please check your credentials and try again.';
              }
              if (excText.includes('Incorrect password')) {
                return 'Incorrect password. Please check your password and try again.';
              }
            }
          } catch (parseError) {
            // If parsing fails, check if exc is a string
            if (typeof responseData.exc === 'string') {
              if (responseData.exc.includes('Invalid Login') || responseData.exc.includes('Invalid User')) {
                return 'Invalid email or password. Please check your credentials and try again.';
              }
            }
          }
        }
      }
      return 'Invalid email or password. Please check your credentials and try again.';
    }
    if (error.response?.status === 403) {
      return 'Access denied. Please contact support.';
    }
    if (error.response?.status === 404) {
      return 'Login endpoint not found. Please check your server configuration.';
    }
    if (error.response?.status === 500) {
      return 'Server error. Please try again later.';
    }

    // Network/timeout errors
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      return 'Connection timeout. Please check your internet connection and try again.';
    }
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return 'Cannot connect to server. Please check your internet connection.';
    }
    if (error.message === 'Network Error') {
      return 'Network error. Please check your internet connection and try again.';
    }

    // Default error message
    return error.message || 'Login failed. Please check your credentials and try again.';
  }

  // USERS
  async createUser(userData: {
    email: string;
    first_name: string;
    last_name: string;
    middle_name?: string;
    phone?: string;
    send_welcome_email?: boolean;
  }): Promise<any> {
    try {
      // ERPNext User doctype fields - matching exact API structure
      const userPayload: any = {
        email: userData.email.trim(),
        first_name: userData.first_name.trim(),
        last_name: userData.last_name.trim(),
        send_welcome_email: userData.send_welcome_email !== false ? 1 : 0, // 1 = true, 0 = false
        roles: [
          { role: 'Customer' }
        ],
      };

      // Add middle name if provided
      if (userData.middle_name?.trim()) {
        userPayload.middle_name = userData.middle_name.trim();
      }

      // Add mobile number if provided
      if (userData.phone?.trim()) {
        userPayload.mobile_no = userData.phone.trim();
      }

      const response = await this.client.post(`${API_VERSION}/User`, userPayload);
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getUserByPhone(phone: string): Promise<any> {
    try {
      // Normalize phone number (remove spaces, handle country codes)
      const normalizedPhone = phone.replace(/\s/g, '').replace(/^\+233/, '0').replace(/^233/, '0');
      const phoneVariants = [
        normalizedPhone,
        phone.replace(/\s/g, ''), // Original format
        `+233${normalizedPhone.slice(1)}`, // With +233
        `233${normalizedPhone.slice(1)}`, // With 233
        normalizedPhone.slice(-9), // Last 9 digits
      ];
      
      // Try each phone variant
      for (const phoneVariant of phoneVariants) {
        try {
          const response = await this.client.get(`${API_VERSION}/User`, {
            params: {
              fields: JSON.stringify(['name', 'email', 'phone']),
              filters: JSON.stringify([
                ['phone', '=', phoneVariant]
              ]),
              limit_page_length: 1,
            },
          });
          
          if (response.data.data && response.data.data.length > 0) {
            return response.data.data[0];
          }
        } catch (variantError) {
          // Continue to next variant
          continue;
        }
      }
      
      // If not found with exact match, try partial match with last 9 digits
      try {
        const last9Digits = normalizedPhone.slice(-9);
        const searchResponse = await this.client.get(`${API_VERSION}/User`, {
          params: {
            fields: JSON.stringify(['name', 'email', 'phone']),
            filters: JSON.stringify([
              ['phone', 'like', `%${last9Digits}%`]
            ]),
            limit_page_length: 1,
          },
        });
        
        if (searchResponse.data.data && searchResponse.data.data.length > 0) {
          return searchResponse.data.data[0];
        }
      } catch (searchError) {
        // Ignore search errors
      }
      
      return null;
    } catch (error) {
      // If user not found, return null instead of throwing
      if ((error as any)?.response?.status === 404 || (error as any)?.response?.status === 417) {
        return null;
      }
      throw this.handleError(error);
    }
  }

  // Get User by email
  async getUserByEmail(email: string): Promise<any> {
    try {
      const response = await this.client.get(`${API_VERSION}/User`, {
        params: {
          fields: JSON.stringify(['name', 'email', 'full_name', 'first_name', 'last_name', 'middle_name', 'phone', 'location']),
          filters: JSON.stringify([
            ['email', '=', email]
          ]),
          limit_page_length: 1,
        },
      });

      if (response.data.data && response.data.data.length > 0) {
        const user = response.data.data[0];
        // Fetch full user document to get image field (not queryable in list views)
        if (user.name) {
          try {
            const fullUser = await this.client.get(`${API_VERSION}/User/${user.name}`);
            if (fullUser.data.data) {
              return { ...user, image: fullUser.data.data.image, location: fullUser.data.data.location };
            }
          } catch (error) {
            // If fetching full document fails, return user without image
            console.warn('Could not fetch full user document for image:', error);
          }
        }
        return user;
      }
      return null;
    } catch (error) {
      // If user not found, return null instead of throwing
      if ((error as any)?.response?.status === 404 || (error as any)?.response?.status === 417) {
        return null;
      }
      throw this.handleError(error);
    }
  }

  async updateUser(userEmail: string, userData: { phone?: string; location?: string }): Promise<any> {
    try {
      // Use session client for user-specific operations
      const sessionClient = this.getSessionClient();
      
      // First, get the user by email to get their name (ID)
      const user = await this.getUserByEmail(userEmail);
      if (!user || !user.name) {
        throw new Error('User not found');
      }

      // Update the user document
      const updateData: any = {};
      if (userData.phone !== undefined) {
        updateData.phone = userData.phone;
      }
      if (userData.location !== undefined) {
        updateData.location = userData.location;
      }

      const response = await sessionClient.put(`${API_VERSION}/User/${user.name}`, updateData);
      
      console.log('User updated successfully:', response.data);
      return response.data.data || response.data;
    } catch (error) {
      console.error('Error updating user:', error);
      throw this.handleError(error);
    }
  }

  // CUSTOMERS
  async getCustomer(customerId: string): Promise<any> {
    try {
      const response = await this.client.get(`${API_VERSION}/Customer/${customerId}`);
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async createCustomer(customerData: {
    customer_name: string;
    email: string;
    phone?: string;
    mobile_no?: string;
    customer_type: 'Company' | 'Individual';
  }): Promise<any> {
    try {
      const payload: any = {
        customer_name: customerData.customer_name,
        customer_type: customerData.customer_type,
        email_id: customerData.email,
        phone: customerData.phone,
        mobile_no: customerData.mobile_no,
      };

      // Ensure the signup email is linked in Customer > Portal Users child table
      if (customerData.email?.trim()) {
        payload.portal_users = [
          { user: customerData.email.trim() },
        ];
      }

      const response = await this.client.post(`${API_VERSION}/Customer`, payload);
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async updateCustomer(customerId: string, customerData: any): Promise<any> {
    try {
      const response = await this.client.put(
        `${API_VERSION}/Customer/${customerId}`,
        customerData
      );
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // ITEMS/PRODUCTS — list uses Item doctype (images from Item.image; Website Item not required)
  async getWebsiteItems(filters?: any, limit: number = 20, offset: number = 0, orderBy?: string, sortByPrice?: 'asc' | 'desc'): Promise<any[]> {
    if (sortByPrice) {
      return this.getWebsiteItemsSortedByPrice(filters, limit, offset, sortByPrice);
    }
    try {
      const fields = [
        'name',
        'item_code',
        'item_name',
        'item_group',
        'stock_uom',
        'brand',
        'description',
        'image',
        'standard_rate',
        'disabled',
        'creation',
        'modified',
      ];

      const defaultFilters = [['Website Item', 'published', '=', 1]];
      const mergedWebsiteFilters = filters ? [...defaultFilters, ...filters] : defaultFilters;
      const mergedFilters = mapWebsiteItemFiltersToItem(mergedWebsiteFilters);

      let url = `${API_VERSION}/Item?fields=${encodeURIComponent(JSON.stringify(fields))}&limit_page_length=${limit}&limit_start=${offset}`;
      url += `&filters=${encodeURIComponent(JSON.stringify(mergedFilters))}`;
      const orderByClause = orderBy || 'modified desc';
      url += `&order_by=${encodeURIComponent(orderByClause)}`;

      console.log('[getWebsiteItems→Item] URL:', url);
      const response = await this.client.get(url);
      const websiteItems = response.data.data || [];

      console.log('[getWebsiteItems→Item] Returned items count:', websiteItems?.length || 0);

      const itemsWithPricesAndStock = await Promise.allSettled(
        websiteItems.map(async (item: any) => {
          const code = item.item_code || item.name;
          if (code) {
            try {
              const price = await this.getItemPrice(code);
              if (price > 0) {
                item.price_list_rate = price;
              }
            } catch (error) {
              console.warn(`Failed to fetch price for ${code}:`, error);
            }
          }
          item.available_stock = 0;
          return item;
        })
      );

      return itemsWithPricesAndStock
        .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
        .map((result) => result.value);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getWebsiteItem(websiteItemName: string): Promise<any> {
    try {
      // Use wildcard to get all fields, or specify fields for better performance
      // For reference, see: src/services/websiteItemFields.ts
      const fields = [
        "name",
        "web_item_name",
        "route",
        "published",
        "item_code",
        "item_name",
        "item_group",
        "stock_uom",
        "custom_company",
        "brand",
        "description",
        "website_image",
        "website_image_alt",
        "thumbnail",
        "slideshow",
        "website_warehouse",
        "on_backorder",
        "short_description",
        "web_long_description",
        "ranking",
        "website_specifications",
        "show_tabbed_section",
        "tabs",
        "recommended_items",
        "offers",
        "website_item_groups",
        "custom_size",
        "creation",
        "modified"
      ];

      // Request slideshow child table if it exists as a child table in Website Item
      // In some ERPNext setups, slideshow might be a child table directly in Website Item
      const fieldsWithSlideshow = [
        ...fields,
        // Try to get slideshow child table if it exists
        // Child tables are typically included when fetching with "*" or specific table names
      ];
      
      const response = await this.client.get(
        `${API_VERSION}/Website Item/${websiteItemName}?fields=${encodeURIComponent(JSON.stringify(fieldsWithSlideshow))}`
      );
      const websiteItem = response.data.data;
      
      // Fetch price from Item Price doctype if item_code is available
      if (websiteItem.item_code) {
        try {
          const price = await this.getItemPrice(websiteItem.item_code);
          if (price > 0) {
            websiteItem.price_list_rate = price;
            console.log(`Fetched price for ${websiteItem.item_code}: ${price}`);
          }
        } catch (error) {
          console.warn(`Failed to fetch price for item ${websiteItem.item_code}:`, error);
        }
      }
      
      // Fetch stock from Bin using the website_warehouse field from Website Item
      // The website_warehouse field specifies which warehouse to check for stock
      if (websiteItem.website_warehouse && websiteItem.item_code) {
        try {
          const stockData = await this.getWarehouseStock(
            websiteItem.website_warehouse, // Use the warehouse specified in website_warehouse field
            websiteItem.item_code
          );
          
          if (stockData && Array.isArray(stockData) && stockData.length > 0) {
            // Calculate total available stock (actual_qty - reserved_qty)
            const totalStock = stockData.reduce((sum: number, bin: any) => {
              const available = (bin.actual_qty || 0) - (bin.reserved_qty || 0);
              return sum + available;
            }, 0);
            websiteItem.available_stock = Math.max(0, totalStock);
            console.log(`[getWebsiteItem] Fetched stock for ${websiteItem.item_code} from warehouse ${websiteItem.website_warehouse}: ${websiteItem.available_stock}`);
          } else {
            websiteItem.available_stock = 0;
            console.log(`[getWebsiteItem] No stock data returned for ${websiteItem.item_code}, setting to 0`);
          }
        } catch (error) {
          console.warn(`[getWebsiteItem] Failed to fetch stock for item ${websiteItem.item_code} from warehouse ${websiteItem.website_warehouse}:`, error);
          websiteItem.available_stock = 0;
        }
      } else {
        // No website_warehouse specified - cannot fetch stock
        if (!websiteItem.website_warehouse) {
          console.warn(`[getWebsiteItem] Website Item ${websiteItem.name || websiteItem.item_code} has no website_warehouse field set`);
        }
        websiteItem.available_stock = 0;
        console.log(`[getWebsiteItem] No warehouse/item_code, setting available_stock to 0`);
      }
      
      // Check if slideshow is a Link field pointing to a Website Slideshow document
      // The slideshow field contains the name of the linked Website Slideshow document
      if (websiteItem.slideshow) {
        if (typeof websiteItem.slideshow === 'string' && websiteItem.slideshow.trim() !== '') {
          // slideshow is a Link field - fetch the linked Website Slideshow document
          console.log(`Website Item "${websiteItemName}" is linked to slideshow: "${websiteItem.slideshow}"`);
          try {
            const slideshowDoc = await this.getSlideshow(websiteItem.slideshow);
            if (slideshowDoc) {
              websiteItem.slideshow_data = slideshowDoc;
              console.log(`Successfully fetched Website Slideshow: "${websiteItem.slideshow}"`);
            }
          } catch (error: any) {
            // Website Slideshow document might not exist or might not be accessible
            console.warn(`Failed to fetch linked Website Slideshow "${websiteItem.slideshow}":`, error?.message || error);
            // Continue without slideshow data - will check for child table in mapper as fallback
          }
        } else {
          console.log(`Website Item "${websiteItemName}" has slideshow field but it's not a valid link:`, websiteItem.slideshow);
        }
      } else {
        console.log(`Website Item "${websiteItemName}" has no slideshow link field`);
      }
      
      return websiteItem;
    } catch (error) {
      throw this.handleError(error);
    }
  }
  
  /**
   * Fetch Website Slideshow document with its child table
   * The child table contains Image, Heading, and Description fields
   */
  async getSlideshow(slideshowName: string): Promise<any> {
    try {
      // Fetch Website Slideshow document with all fields (child tables are included automatically)
      // Using wildcard to ensure all fields and child tables are fetched
      const response = await this.client.get(
        `${API_VERSION}/Website Slideshow/${slideshowName}?fields=["*"]`
      );
      const slideshowData = response.data.data;
      
      // Debug: log what we received
      console.log('Website Slideshow fetched:', slideshowName);
      console.log('Slideshow keys:', Object.keys(slideshowData || {}));
      
      // Check for child tables
      for (const key in slideshowData) {
        if (Array.isArray(slideshowData[key])) {
          console.log(`Found array key in slideshow: ${key} with ${slideshowData[key].length} items`);
          if (slideshowData[key].length > 0) {
            console.log(`First item in ${key}:`, slideshowData[key][0]);
          }
        }
      }
      
      return slideshowData;
    } catch (error) {
      console.error('Error fetching Website Slideshow:', error);
      throw this.handleError(error);
    }
  }
  
  /**
   * Get all fields from a Website Item (for reference/debugging)
   * Use this to discover available fields
   */
  async getWebsiteItemAllFields(websiteItemName: string): Promise<any> {
    try {
      // Fetch with wildcard to get all fields
      const response = await this.client.get(
        `${API_VERSION}/Website Item/${websiteItemName}?fields=["*"]`
      );
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async searchWebsiteItems(query: string, company?: string): Promise<any[]> {
    try {
      if (!query || !query.trim()) {
        return [];
      }

      const searchTerm = query.trim();
      const allResults = new Map<string, any>(); // Use Map to avoid duplicates by name

      // Search in web_item_name
      try {
        const nameFilters: any = [
          ['Website Item', 'published', '=', 1],
          ['Website Item', 'web_item_name', 'like', `%${searchTerm}%`]
        ];
        if (company) {
          nameFilters.push(['Website Item', 'custom_company', '=', company]);
        }
        const nameResults = await this.getWebsiteItems(nameFilters, 50, 0);
        nameResults.forEach((item: any) => {
          if (item.name) {
            allResults.set(item.name, item);
          }
        });
      } catch (error) {
        console.warn('Error searching by web_item_name:', error);
      }

      // Search in item_code
      try {
        const codeFilters: any = [
          ['Website Item', 'published', '=', 1],
          ['Website Item', 'item_code', 'like', `%${searchTerm}%`]
        ];
      if (company) {
          codeFilters.push(['Website Item', 'custom_company', '=', company]);
      }
        const codeResults = await this.getWebsiteItems(codeFilters, 50, 0);
        codeResults.forEach((item: any) => {
          if (item.name) {
            allResults.set(item.name, item);
          }
        });
      } catch (error) {
        console.warn('Error searching by item_code:', error);
      }

      // Search in item_group
      try {
        const groupFilters: any = [
          ['Website Item', 'published', '=', 1],
          ['Website Item', 'item_group', 'like', `%${searchTerm}%`]
        ];
        if (company) {
          groupFilters.push(['Website Item', 'custom_company', '=', company]);
        }
        const groupResults = await this.getWebsiteItems(groupFilters, 50, 0);
        groupResults.forEach((item: any) => {
          if (item.name) {
            allResults.set(item.name, item);
          }
        });
      } catch (error) {
        console.warn('Error searching by item_group:', error);
      }

      // Convert Map to Array
      const websiteItems = Array.from(allResults.values());
      
      // Fetch prices and stock for search results
      const itemsWithPricesAndStock = await Promise.allSettled(
        websiteItems.map(async (item: any) => {
          // Fetch price if item_code is available
          if (item.item_code) {
            try {
              const price = await this.getItemPrice(item.item_code);
              if (price > 0) {
                item.price_list_rate = price;
              }
    } catch (error) {
              // Price fetch failed
            }
          }
          
          // Fetch stock if warehouse is available
          if (item.website_warehouse && item.item_code) {
            try {
              const stockData = await this.getWarehouseStock(
                item.website_warehouse,
                item.item_code
              );
              
              if (stockData && Array.isArray(stockData) && stockData.length > 0) {
                const totalStock = stockData.reduce((sum: number, bin: any) => {
                  const available = (bin.actual_qty || 0) - (bin.reserved_qty || 0);
                  return sum + available;
                }, 0);
                item.available_stock = Math.max(0, totalStock);
              } else {
                item.available_stock = 0;
              }
            } catch (error) {
              item.available_stock = 0;
            }
          } else {
            item.available_stock = 0;
          }
          
          return item;
        })
      );
      
      // Extract successful results
      return itemsWithPricesAndStock
        .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
        .map(result => result.value);
    } catch (error) {
      throw this.handleError(error);
    }
  }


  async getWebsiteItemsByCompany(company: string, limit: number = 50): Promise<any[]> {
    // Use getWebsiteItems with company filter - it already handles prices and stock
    const filters = [
      ['Website Item', 'custom_company', '=', company]
    ];
    return this.getWebsiteItems(filters, limit, 0);
  }

  // ITEMS/PRODUCTS - Legacy Item doctype (now delegates to Website Item)
  async getItems(filters?: any, limit: number = 20, offset: number = 0): Promise<any[]> {
    // Use Website Item instead of Item for better eCommerce support
    return this.getWebsiteItems(filters, limit, offset);
  }

  // Retry helper with exponential backoff
  private async retryRequest<T>(
    requestFn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error: any) {
        lastError = error;
        
        // Only retry on network errors or timeouts
        const isNetworkError = 
          error.code === 'ECONNABORTED' ||
          error.message === 'Network Error' ||
          error.code === 'ERR_NETWORK' ||
          error.code === 'ETIMEDOUT';
        
        if (!isNetworkError || attempt === maxRetries) {
          throw error;
        }
        
        // Exponential backoff: 1s, 2s, 4s
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`Network error on attempt ${attempt + 1}/${maxRetries + 1}. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  // Get latest Website Items (new arrivals) sorted by creation date
  async getNewArrivals(limit: number = 20, sortByPrice?: 'asc' | 'desc'): Promise<any[]> {
    return this.retryRequest(async () => {
      const filters = [['Website Item', 'published', '=', 1]];
      if (sortByPrice) {
        return this.getWebsiteItemsSortedByPrice(filters, limit, 0, sortByPrice);
      }

      // Same list request as getWebsiteItems (includes order_by, merged filters) — avoids 404s from a divergent URL.
      const fetchLimit = limit * 3;
      const items = await this.getWebsiteItems(filters, fetchLimit, 0, 'creation desc');

      const validItems = Array.isArray(items) ? [...items] : [];

      validItems.sort((a: any, b: any) => {
        if (a.ranking != null && b.ranking != null) {
          return (b.ranking as number) - (a.ranking as number);
        }
        const dateA = a.creation ? new Date(a.creation).getTime() : 0;
        const dateB = b.creation ? new Date(b.creation).getTime() : 0;
        return dateB - dateA;
      });

      return validItems.slice(0, limit);
    }).catch((error: any) => {
      console.error('Error fetching new arrivals:', error);
      throw this.handleError(error);
    });
  }

  // Get Website Items by group/category with optional price sorting
  async getWebsiteItemsByGroup(groupName: string, limit: number = 50, offset: number = 0, sortByPrice?: 'asc' | 'desc'): Promise<any[]> {
    // If price sorting is requested, use server-side sorting from ERPNext
    if (sortByPrice) {
      return this.getWebsiteItemsSortedByPrice(
        [['Website Item', 'item_group', '=', groupName]],
        limit,
        offset,
        sortByPrice
      );
    }
    // Use getWebsiteItems with item_group filter - it already handles prices and stock
    const filters = [['Website Item', 'item_group', '=', groupName]];
    return this.getWebsiteItems(filters, limit, offset);
  }
  
  /**
   * Get Website Items sorted by price from ERPNext (server-side sorting)
   * First queries Item Price to get sorted item codes, then fetches Website Items
   */
  async getWebsiteItemsSortedByPrice(
    filters?: any,
    limit: number = 20,
    offset: number = 0,
    sortDirection: 'asc' | 'desc' = 'asc'
  ): Promise<any[]> {
    try {
      // Step 1: Get all Website Items first to get their item_codes
      // Call getWebsiteItems with sortByPrice=undefined to avoid recursion
      const allWebsiteItems = await this.getWebsiteItems(filters, 1000, 0, undefined, undefined); // Get more items to sort properly
      const itemCodes = allWebsiteItems
        .map((item: any) => item.item_code)
        .filter((code: string) => code); // Filter out null/undefined
      
      if (itemCodes.length === 0) {
        return [];
      }
      
      // Step 2: Query Item Price sorted by price_list_rate
      const priceList = this.config.defaultPriceList || 'Standard Selling';
      const orderBy = sortDirection === 'asc' ? 'price_list_rate asc' : 'price_list_rate desc';
      
      // Build filters for Item Price: item_code in list AND price_list matches
      const priceFilters = [
        ['Item Price', 'item_code', 'in', itemCodes],
        ['Item Price', 'price_list', '=', priceList]
      ];
      
      const priceFields = ['item_code', 'price_list_rate', 'price_list'];
      let priceUrl = `${API_VERSION}/Item Price?fields=${encodeURIComponent(JSON.stringify(priceFields))}`;
      priceUrl += `&filters=${encodeURIComponent(JSON.stringify(priceFilters))}`;
      priceUrl += `&order_by=${encodeURIComponent(orderBy)}`;
      priceUrl += `&limit_page_length=${limit + offset}`; // Get enough to handle offset
      
      const priceResponse = await this.client.get(priceUrl);
      const sortedPrices = priceResponse.data.data || [];
      
      // Step 3: Create a map of item_code -> price for quick lookup
      const priceMap = new Map<string, number>();
      sortedPrices.forEach((priceItem: any) => {
        if (priceItem.item_code && priceItem.price_list_rate) {
          // Keep the first (best) price for each item_code
          if (!priceMap.has(priceItem.item_code)) {
            priceMap.set(priceItem.item_code, priceItem.price_list_rate);
          }
        }
      });
      
      // Step 4: Get sorted item codes (in price order)
      const sortedItemCodes = sortedPrices
        .map((priceItem: any) => priceItem.item_code)
        .filter((code: string) => code)
        .slice(offset, offset + limit); // Apply offset and limit
      
      // Step 5: Fetch Website Items for the sorted item codes
      // We need to fetch them in the sorted order
      const websiteItemMap = new Map<string, any>();
      allWebsiteItems.forEach((item: any) => {
        if (item.item_code) {
          websiteItemMap.set(item.item_code, item);
        }
      });
      
      // Step 6: Build result array in price-sorted order
      const sortedWebsiteItems = sortedItemCodes
        .map((itemCode: string) => websiteItemMap.get(itemCode))
        .filter((item: any) => item); // Remove any missing items
      
      // Step 7: Add prices and stock (prices already in map, just attach them)
      const itemsWithPricesAndStock = await Promise.allSettled(
        sortedWebsiteItems.map(async (item: any) => {
          // Use price from priceMap if available
          const price = priceMap.get(item.item_code);
          if (price && price > 0) {
            item.price_list_rate = price;
          } else {
            // Fallback to fetching price individually
            try {
              const fetchedPrice = await this.getItemPrice(item.item_code);
              if (fetchedPrice > 0) {
                item.price_list_rate = fetchedPrice;
              }
            } catch (error) {
              console.warn(`Failed to fetch price for ${item.item_code}:`, error);
            }
          }
          
          // Fetch stock
          if (item.website_warehouse && item.item_code) {
            try {
              const stockData = await this.getWarehouseStock(
                item.website_warehouse,
                item.item_code
              );
              
              if (stockData && Array.isArray(stockData) && stockData.length > 0) {
                const totalStock = stockData.reduce((sum: number, bin: any) => {
                  const available = (bin.actual_qty || 0) - (bin.reserved_qty || 0);
                  return sum + available;
                }, 0);
                item.available_stock = Math.max(0, totalStock);
              } else {
                item.available_stock = 0;
              }
            } catch (error) {
              console.warn(`Failed to fetch stock for ${item.item_code}:`, error);
              item.available_stock = 0;
            }
          } else {
            item.available_stock = 0;
          }
          
          return item;
        })
      );
      
      // Extract successful results
      return itemsWithPricesAndStock
        .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
        .map(result => result.value);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Legacy method - kept for backward compatibility
  async _getWebsiteItemsByGroupLegacy(groupName: string, limit: number = 50): Promise<any[]> {
    return this.retryRequest(async () => {
      const filters = [
        ['Website Item', 'item_group', '=', groupName],
        ['Website Item', 'published', '=', 1]
      ];
      
      const fields = [
        'name',
        'web_item_name',
        'route',
        'published',
        'item_code',
        'item_name',
        'item_group',
        'stock_uom',
        'custom_company',
        'brand',
        'description',
        'short_description',
        'web_long_description',
        'website_image',
        'website_image_alt',
        'thumbnail',
        'website_warehouse',
        'on_backorder',
        'ranking',
        'creation',
        'modified'
      ];
      
      let url = `${API_VERSION}/Website Item?fields=${encodeURIComponent(JSON.stringify(fields))}&limit_page_length=${limit}`;
      url += `&filters=${encodeURIComponent(JSON.stringify(filters))}`;

      const response = await this.client.get(url);
      let items = response.data.data || [];
      
      // Filter out unpublished items
      items = items.filter((item: any) => item.published === 1);
      
      // Sort by ranking or creation date
      items.sort((a: any, b: any) => {
        if (a.ranking && b.ranking) {
          return b.ranking - a.ranking;
        }
        const dateA = a.creation ? new Date(a.creation).getTime() : 0;
        const dateB = b.creation ? new Date(b.creation).getTime() : 0;
        return dateB - dateA;
      });
      
      return items.slice(0, limit);
    }).catch((error: any) => {
      throw this.handleError(error);
    });
  }

  /** Single Item document (item code = `name`) — images from Item.image */
  async getItem(itemCode: string): Promise<any> {
    try {
      const fields = [
        'name',
        'item_code',
        'item_name',
        'item_group',
        'stock_uom',
        'brand',
        'description',
        'image',
        'standard_rate',
        'disabled',
        'creation',
        'modified',
      ];
      const url = `${API_VERSION}/Item/${encodeURIComponent(itemCode)}?fields=${encodeURIComponent(JSON.stringify(fields))}`;
      const response = await this.client.get(url);
      const item = response.data.data;
      if (!item) {
        throw new Error(`Item not found: ${itemCode}`);
      }
      const code = item.item_code || item.name;
      try {
        const price = await this.getItemPrice(code);
        if (price > 0) {
          item.price_list_rate = price;
        }
      } catch {
        /* use standard_rate in mapper */
      }
      item.available_stock = 0;
      return item;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async searchItems(query: string, company?: string): Promise<any[]> {
    // Use Website Item for better eCommerce search
    return this.searchWebsiteItems(query, company);
  }

  // SALES ORDERS
  async createSalesOrder(orderData: {
    customer: string;
    company: string;
    transaction_date?: string;
    items: Array<{
      item_code: string;
      qty: number;
      rate?: number;
      amount?: number;
      description?: string;
    }>;
    delivery_date?: string;
  }): Promise<any> {
    try {
      const response = await this.client.post(`${API_VERSION}/Sales Order`, orderData);
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Create a Sales Invoice from a Sales Order
   * 
   * @param salesOrderName - Sales Order name (e.g., "SAL-ORD-2025-00031")
   * @param userEmail - User email to set in custom_user field (optional)
   * @returns Created Sales Invoice
   */
  async createSalesInvoiceFromSalesOrder(salesOrderName: string, userEmail?: string): Promise<any> {
    try {
      // First, get the Sales Order to extract its data
      const salesOrder = await this.getSalesOrder(salesOrderName);
      console.log('Sales Order fetched for invoice creation:', salesOrder.name);
      
      // Create Sales Invoice manually from Sales Order data
      const invoiceData: any = {
        customer: salesOrder.customer,
        company: salesOrder.company,
        posting_date: salesOrder.transaction_date || new Date().toISOString().split('T')[0],
        due_date: salesOrder.delivery_date || new Date().toISOString().split('T')[0],
        items: [],
      };
      
      // Set custom_user field with user email (required for filtering invoices by user)
      if (userEmail) {
        invoiceData.custom_user = userEmail;
        console.log('✅ Setting custom_user field to:', userEmail);
      } else {
        console.warn('⚠️ No userEmail provided - custom_user field will not be set');
      }
      
      // Copy items from Sales Order to Sales Invoice
      if (salesOrder.items && Array.isArray(salesOrder.items)) {
        invoiceData.items = salesOrder.items.map((item: any) => ({
          item_code: item.item_code,
          item_name: item.item_name,
          qty: item.qty,
          rate: item.rate,
          amount: item.amount,
          sales_order: salesOrder.name,
          so_detail: item.name, // Reference to Sales Order Item
        }));
      }
      
      console.log('Creating Sales Invoice with data:', JSON.stringify(invoiceData, null, 2));
      console.log('Invoice custom_user field:', invoiceData.custom_user);
      
      // Create the Sales Invoice
      const response = await this.client.post(`${API_VERSION}/Sales Invoice`, invoiceData);
      const createdInvoice = response.data.data;
      
      console.log('Sales Invoice created successfully:', createdInvoice.name);
      console.log('Created Invoice custom_user field:', createdInvoice.custom_user);
      
      // Verify custom_user was set correctly
      if (userEmail && createdInvoice.custom_user !== userEmail) {
        console.warn('⚠️ Warning: custom_user field may not have been set correctly');
        console.warn('Expected:', userEmail, 'Got:', createdInvoice.custom_user);
      }
      
      return createdInvoice;
    } catch (error: any) {
      console.error('Error in createSalesInvoiceFromSalesOrder:', error);
      console.error('Error details:', {
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status,
      });
      
      // If manual creation fails, try the make_sales_invoice method as fallback
      try {
        console.log('Trying make_sales_invoice method as fallback');
        const fallbackResponse = await this.client.post('/api/method/erpnext.selling.doctype.sales_order.sales_order.make_sales_invoice', {
          source_name: salesOrderName,
        });
        
        console.log('Fallback response:', JSON.stringify(fallbackResponse.data, null, 2));
        
        // Try to extract invoice name from fallback response
        let invoiceName: string | null = null;
        
        if (fallbackResponse.data?.message) {
          const msg = fallbackResponse.data.message;
          if (typeof msg === 'string') {
            invoiceName = msg;
          } else if (msg?.name) {
            invoiceName = msg.name;
          } else if (Array.isArray(msg) && msg.length > 0) {
            invoiceName = typeof msg[0] === 'string' ? msg[0] : msg[0]?.name;
          }
        }
        
        if (invoiceName) {
          await new Promise(resolve => setTimeout(resolve, 500));
          const invoiceResponse = await this.client.get(`${API_VERSION}/Sales Invoice/${invoiceName}`);
          return invoiceResponse.data.data;
        }
      } catch (fallbackError) {
        console.error('Fallback method also failed:', fallbackError);
      }
      
      throw this.handleError(error);
    }
  }

  /**
   * Submit a Sales Invoice
   * Submits the Sales Invoice (sets docstatus to 1)
   * 
   * @param invoiceName - Sales Invoice name (e.g., "ACC-SINV-2025-00007")
   * @returns Submitted Sales Invoice
   */
  async submitSalesInvoice(invoiceName: string): Promise<any> {
    try {
      // Use direct docstatus update via PUT request with ignore_version query parameter
      // This avoids TimestampMismatchError by bypassing the submit API entirely
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Fetch latest version first to get current state
      const latestInvoice = await this.client.get(`${API_VERSION}/Sales Invoice/${invoiceName}`);
      console.log('Fetched latest Sales Invoice before submission, modified:', latestInvoice.data.data.modified);
      
      // Wait a bit more to ensure we have the absolute latest
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Update docstatus directly using PUT with ignore_version query parameter
      const updateResponse = await this.client.put(
        `${API_VERSION}/Sales Invoice/${invoiceName}?ignore_version=1`,
        {
          docstatus: 1,
        }
      );
      
      // Verify submission by checking docstatus
      await new Promise(resolve => setTimeout(resolve, 500));
      const verifyInvoice = await this.client.get(`${API_VERSION}/Sales Invoice/${invoiceName}`);
      const invoice = verifyInvoice.data.data;
      
      if (invoice.docstatus === 1) {
        console.log('Sales Invoice submitted successfully (docstatus = 1) via direct update');
        return invoice;
      } else {
        throw new Error('Sales Invoice docstatus is not 1 after update');
      }
    } catch (error) {
      // If direct update fails, try one more time with a longer wait
      try {
        console.warn('Direct docstatus update failed, retrying with longer wait');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const retryResponse = await this.client.put(
          `${API_VERSION}/Sales Invoice/${invoiceName}?ignore_version=1`,
          {
            docstatus: 1,
          }
        );
        
        // Verify
        await new Promise(resolve => setTimeout(resolve, 500));
        const verifyInvoice = await this.client.get(`${API_VERSION}/Sales Invoice/${invoiceName}`);
        return verifyInvoice.data.data;
      } catch (retryError) {
        throw this.handleError(error);
      }
    }
  }

  async getCustomerByEmail(email: string): Promise<any | null> {
    try {
      // Customer doctype has a child table 'portal_users' with field 'user' containing the email
      // Use API key/secret client for admin-level access to query Customer doctype
      
      // Approach 1: Fetch customers using REST API with API key and check portal_users child table
      // This is the most reliable approach since child table filters don't work well in REST API
      try {
        const response = await this.client.get(`${API_VERSION}/Customer`, {
          params: {
            fields: JSON.stringify(['name', 'customer_name', 'email_id']),
            limit_page_length: 100, // Fetch in batches to optimize
          },
        });
        
        if (response.data && response.data.data) {
          // For each customer, fetch full details with portal_users child table
          for (const cust of response.data.data) {
            try {
              const fullCustomer = await this.client.get(`${API_VERSION}/Customer/${cust.name}`, {
                params: {
                  fields: JSON.stringify(['name', 'customer_name', 'email_id', 'portal_users']),
                },
              });
              
              if (fullCustomer.data && fullCustomer.data.data) {
                const customerData = fullCustomer.data.data;
                // Check if portal_users child table contains the matching email
                if (customerData.portal_users && Array.isArray(customerData.portal_users)) {
                  const hasMatch = customerData.portal_users.some((pu: any) => pu.user === email);
                  if (hasMatch) {
                    console.log('Customer found via portal_users (API key):', customerData.name);
                    return {
                      name: customerData.name, // Customer ID
                      customer_name: customerData.customer_name, // Display name
                      email_id: customerData.email_id,
                    };
                  }
                }
              }
            } catch (fetchError) {
              // Skip this customer and continue
              continue;
            }
          }
        }
      } catch (fetchError: any) {
        console.warn('Fetch customers approach failed:', fetchError?.response?.status || fetchError.message);
      }
      
      // Approach 2: Try email_id as fallback (if customer has email_id field set)
      try {
        const filters = [['email_id', '=', email]];
        const response = await this.client.get(`${API_VERSION}/Customer`, {
          params: {
            fields: JSON.stringify(['name', 'customer_name', 'email_id']),
            filters: JSON.stringify(filters),
            limit_page_length: 1,
          },
        });
        
        if (response.data && response.data.data && response.data.data.length > 0) {
          console.log('Customer found via email_id (API key):', response.data.data[0].name);
          return response.data.data[0];
        }
      } catch (emailError: any) {
        console.warn('Email ID filter failed:', emailError?.response?.status || emailError.message);
      }
      
      console.warn('No customer found for email:', email);
      return null;
    } catch (error: any) {
      console.error('Error fetching customer by email:', error?.response?.data || error?.message || error);
      return null;
    }
  }

  async getSalesOrder(orderName: string): Promise<any> {
    try {
      const response = await this.client.get(`${API_VERSION}/Sales Order/${orderName}`);
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Submit a Sales Order
   * Submits the Sales Order so it can be referenced in Payment Entries
   * Sets docstatus to 1 (Submitted)
   * 
   * @param orderName - Sales Order name (e.g., "SAL-ORD-2025-00031")
   * @returns Submitted Sales Order
   */
  async submitSalesOrder(orderName: string): Promise<any> {
    try {
      // Use direct docstatus update via PUT request with ignore_version query parameter
      // This avoids TimestampMismatchError by bypassing the submit API entirely
      // Wait a moment for the document to be fully created
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Fetch latest version first to get current state
      const latestOrder = await this.client.get(`${API_VERSION}/Sales Order/${orderName}`);
      console.log('Fetched latest Sales Order before submission, modified:', latestOrder.data.data.modified);
      
      // Wait a bit more to ensure we have the absolute latest
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Update docstatus directly using PUT with ignore_version query parameter
      const updateResponse = await this.client.put(
        `${API_VERSION}/Sales Order/${orderName}?ignore_version=1`,
        {
          docstatus: 1,
        }
      );
      
      // Verify submission by checking docstatus
      await new Promise(resolve => setTimeout(resolve, 500));
      const verifyOrder = await this.client.get(`${API_VERSION}/Sales Order/${orderName}`);
      const order = verifyOrder.data.data;
      
      if (order.docstatus === 1) {
        console.log('Sales Order submitted successfully (docstatus = 1) via direct update');
        return order;
      } else {
        throw new Error('Sales Order docstatus is not 1 after update');
      }
    } catch (error) {
      // If direct update fails, try one more time with a longer wait
      try {
        console.warn('Direct docstatus update failed, retrying with longer wait');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const retryResponse = await this.client.put(
          `${API_VERSION}/Sales Order/${orderName}?ignore_version=1`,
          {
            docstatus: 1,
          }
        );
        
        // Verify
        await new Promise(resolve => setTimeout(resolve, 500));
        const verifyOrder = await this.client.get(`${API_VERSION}/Sales Order/${orderName}`);
        return verifyOrder.data.data;
      } catch (retryError) {
        throw this.handleError(error);
      }
    }
  }

  /**
   * Submit a Payment Entry
   * Submits the Payment Entry (sets docstatus to 1)
   * 
   * @param paymentEntryName - Payment Entry name (e.g., "ACC-PAY-2025-00007")
   * @returns Submitted Payment Entry
   */
  async submitPaymentEntry(paymentEntryName: string): Promise<any> {
    try {
      // Use direct docstatus update via PUT request with ignore_version query parameter
      // This avoids TimestampMismatchError by bypassing the submit API entirely
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Fetch latest version first to get current state
      const latestEntry = await this.getPaymentEntry(paymentEntryName);
      console.log('Fetched latest Payment Entry before submission, modified:', latestEntry.modified);
      
      // Wait a bit more to ensure we have the absolute latest
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Update docstatus directly using PUT with ignore_version query parameter
      const updateResponse = await this.client.put(
        `${API_VERSION}/Payment Entry/${paymentEntryName}?ignore_version=1`,
        {
          docstatus: 1,
        }
      );
      
      // Verify submission by checking docstatus
      await new Promise(resolve => setTimeout(resolve, 500));
      const verifyEntry = await this.getPaymentEntry(paymentEntryName);
      
      if (verifyEntry.docstatus === 1) {
        console.log('Payment Entry submitted successfully (docstatus = 1) via direct update');
        return verifyEntry;
      } else {
        // If direct update didn't work, try one more time with longer wait
        console.warn('Direct update did not set docstatus to 1, retrying');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const retryUpdate = await this.client.put(
          `${API_VERSION}/Payment Entry/${paymentEntryName}?ignore_version=1`,
          {
            docstatus: 1,
          }
        );
        
        // Verify again
        await new Promise(resolve => setTimeout(resolve, 500));
        const retryVerify = await this.getPaymentEntry(paymentEntryName);
        return retryVerify;
      }
    } catch (error: any) {
      // If direct update fails, try one more time with a longer wait
      try {
        console.warn('Direct docstatus update failed, retrying with longer wait');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const retryResponse = await this.client.put(
          `${API_VERSION}/Payment Entry/${paymentEntryName}?ignore_version=1`,
          {
            docstatus: 1,
          }
        );
        
        // Verify
        await new Promise(resolve => setTimeout(resolve, 500));
        const verifyEntry = await this.getPaymentEntry(paymentEntryName);
        return verifyEntry;
      } catch (retryError) {
        throw this.handleError(error);
      }
    }
  }

  /**
   * Get a Payment Entry by name
   * 
   * @param paymentEntryName - Payment Entry name
   * @returns Payment Entry
   */
  async getPaymentEntry(paymentEntryName: string): Promise<any> {
    try {
      const response = await this.client.get(`${API_VERSION}/Payment Entry/${paymentEntryName}`);
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Create a Payment Entry against a Sales Invoice
   * 
   * @param paymentEntryData - Payment Entry data
   * @param submit - Whether to submit the Payment Entry immediately (docstatus = 1)
   * @returns Created Payment Entry
   */
  async createPaymentEntry(
    paymentEntryData: {
      party_type: string; // 'Customer'
      party: string; // Customer name
      payment_type: string; // 'Receive' for customer payments
      company: string;
      paid_amount: number; // Amount paid
      received_amount: number; // Amount received (same as paid_amount for customer)
      references?: Array<{
        reference_doctype: string; // 'Sales Invoice'
        reference_name: string; // Sales Invoice name
        total_amount: number;
        outstanding_amount: number;
        allocated_amount: number;
      }>;
      mode_of_payment?: string;
      custom_paystack_reference?: string;
      custom_paystack_status?: string;
      custom_display_text?: string;
    },
    submit: boolean = false
  ): Promise<any> {
    try {
      // Create the Payment Entry as draft first
      const response = await this.client.post(`${API_VERSION}/Payment Entry`, paymentEntryData);
      const paymentEntry = response.data.data;
      
      // If submit is true, update docstatus directly to 1 (bypass submit API)
      if (submit && paymentEntry.name) {
        try {
          // Wait a moment for the document to be fully created and processed by ERPNext
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Fetch the latest version to get current state
          const latestEntry = await this.getPaymentEntry(paymentEntry.name);
          console.log('Fetched latest Payment Entry before submission, modified:', latestEntry.modified);
          
          // Wait a bit more to ensure we have the absolute latest
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Update docstatus directly using PUT with ignore_version query parameter
          // This bypasses the submit API entirely to avoid timestamp mismatch
          const updateResponse = await this.client.put(
            `${API_VERSION}/Payment Entry/${paymentEntry.name}?ignore_version=1`,
            {
              docstatus: 1,
            }
          );
          
          // Verify submission
          await new Promise(resolve => setTimeout(resolve, 500));
          const verifyEntry = await this.getPaymentEntry(paymentEntry.name);
          
          if (verifyEntry.docstatus === 1) {
            console.log('Payment Entry created and submitted successfully (docstatus = 1) via direct update');
            return verifyEntry;
          } else {
            // If direct update didn't work, try one more time with longer wait
            console.warn('Direct update did not set docstatus to 1, retrying');
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const retryUpdate = await this.client.put(
              `${API_VERSION}/Payment Entry/${paymentEntry.name}?ignore_version=1`,
              {
                docstatus: 1,
              }
            );
            
            // Verify again
            await new Promise(resolve => setTimeout(resolve, 500));
            const retryVerify = await this.getPaymentEntry(paymentEntry.name);
            return retryVerify;
          }
        } catch (submitError: any) {
          console.warn('Error updating Payment Entry docstatus:', submitError);
          // Return the created entry even if submission fails
          return paymentEntry;
        }
      }
      
      return paymentEntry;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getSalesOrders(
    customerId: string,
    company?: string,
    limit: number = 20,
    start: number = 0
  ): Promise<any[]> {
    try {
      // Return empty array if customerId is empty or invalid
      if (!customerId || customerId.trim() === '') {
        return [];
      }

      const filters = [['Sales Order', 'customer', '=', customerId]];
      if (company) {
        filters.push(['Sales Order', 'company', '=', company]);
      }

      const response = await this.client.get(`${API_VERSION}/Sales Order`, {
        params: {
          fields: JSON.stringify(['name', 'customer', 'company', 'status', 'docstatus', 'total', 'transaction_date', 'grand_total', 'creation']),
          filters: JSON.stringify(filters),
          limit_page_length: limit,
          limit_start: start,
          order_by: 'creation desc',
        },
      });
      
      return response.data.data || [];
    } catch (error) {
      // If it's a JSON decode error or filter error, return empty array
      const errorMessage = (error as any)?.response?.data?.exc || (error as any)?.message || '';
      if (errorMessage.includes('JSONDecodeError') || errorMessage.includes('Expecting value')) {
        console.warn('Invalid filters for Sales Order query, returning empty array');
        return [];
      }
      throw this.handleError(error);
    }
  }

  async updateSalesOrder(orderName: string, orderData: any): Promise<any> {
    try {
      const response = await this.client.put(
        `${API_VERSION}/Sales Order/${orderName}`,
        orderData
      );
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // SALES INVOICES
  async getSalesInvoices(
    userEmail: string,
    limit: number = 20
  ): Promise<any[]> {
    try {
      // Return empty array if userEmail is empty or invalid
      if (!userEmail || userEmail.trim() === '') {
        return [];
      }

      // Use session client for user-specific operations
      const sessionClient = this.getSessionClient();

      // Filter by custom_user field to get invoices for the logged-in user
      const filters = [['Sales Invoice', 'custom_user', '=', userEmail]];

      const response = await sessionClient.get(`${API_VERSION}/Sales Invoice`, {
        params: {
          fields: JSON.stringify(['name', 'customer', 'posting_date', 'grand_total', 'status', 'custom_user']),
          filters: JSON.stringify(filters),
          limit_page_length: limit,
          order_by: 'posting_date desc',
        },
      });
      
      const invoices = response.data.data || [];
      console.log(`📄 Fetched ${invoices.length} Sales Invoices for user ${userEmail}`);
      if (invoices.length > 0) {
        console.log('Sample invoice:', {
          name: invoices[0].name,
          customer: invoices[0].customer,
          custom_user: invoices[0].custom_user,
          posting_date: invoices[0].posting_date,
          grand_total: invoices[0].grand_total,
          status: invoices[0].status,
        });
      }
      
      return invoices;
    } catch (error) {
      console.error('Error fetching Sales Invoices:', error);
      // If it's a JSON decode error or filter error, return empty array
      const errorMessage = (error as any)?.response?.data?.exc || (error as any)?.message || '';
      if (errorMessage.includes('JSONDecodeError') || errorMessage.includes('Expecting value')) {
        console.warn('Invalid filters for Sales Invoice query, returning empty array');
        return [];
      }
      throw this.handleError(error);
    }
  }

  async getSalesInvoice(invoiceName: string): Promise<any> {
    try {
      // Use session client for user-specific operations
      const sessionClient = this.getSessionClient();
      
      // Fetch the full invoice document by name to get child table data (items)
      const response = await sessionClient.get(`${API_VERSION}/Sales Invoice/${invoiceName}`);
      
      if (response.data.data) {
        const invoice = response.data.data;
        
        console.log('Sales Invoice fetched:', {
          name: invoice.name,
          customer: invoice.customer,
          date: invoice.date,
          posting_time: invoice.posting_time,
          itemsCount: invoice.items?.length || 0,
          items: invoice.items,
        });
        
        return invoice;
      }
      
      return null;
    } catch (error) {
      // If invoice not found, return null instead of throwing
      if ((error as any)?.response?.status === 404 || (error as any)?.response?.status === 417) {
        return null;
      }
      throw this.handleError(error);
    }
  }

  // INVOICES (Legacy - keeping for backward compatibility)
  async createInvoice(invoiceData: {
    customer: string;
    company: string;
    items: Array<{
      item_code: string;
      qty: number;
      rate: number;
    }>;
    due_date?: string;
  }): Promise<any> {
    try {
      const response = await this.client.post(
        `${API_VERSION}/Sales Invoice`,
        invoiceData
      );
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getInvoice(invoiceName: string): Promise<any> {
    try {
      const response = await this.client.get(`${API_VERSION}/Sales Invoice/${invoiceName}`);
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // STOCK
  async getItemStock(itemCode: string, warehouse?: string): Promise<any> {
    try {
      let url = `${API_VERSION}/Item/${itemCode}`;
      const response = await this.client.get(url);
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getWarehouseStock(warehouse: string, itemCode?: string): Promise<any> {
    try {
      // Build filters array - escape special characters in values
      const filters: any[] = [['Bin', 'warehouse', '=', warehouse]];
      if (itemCode) {
        filters.push(['Bin', 'item_code', '=', itemCode]);
      }

      // Use the same URL building approach as getWebsiteItems (which works)
      const fields = ['item_code', 'warehouse', 'actual_qty', 'reserved_qty', 'ordered_qty'];
      const fieldsStr = JSON.stringify(fields);
      const filtersStr = JSON.stringify(filters);
      
      // Build URL exactly like getWebsiteItems does
      let url = `${API_VERSION}/Bin?fields=${encodeURIComponent(fieldsStr)}`;
      url += `&filters=${encodeURIComponent(filtersStr)}`;

      const response = await this.client.get(url);
      if (response.data && response.data.data) {
      return response.data.data;
      }
      return [];
    } catch (error: any) {
      const errorData = error?.response?.data as ERPNextError | undefined;
      // Log the actual error for debugging
      if (errorData?.exc_type === 'JSONDecodeError') {
        console.warn(`ERPNext JSON decode error for Bin query. Warehouse: ${warehouse}, Item: ${itemCode}`);
        console.warn(`This might indicate an ERPNext server configuration issue or API version mismatch.`);
        return [];
      }
      console.error(`Error fetching warehouse stock for warehouse: ${warehouse}, item: ${itemCode}`, error);
      // Don't throw - return empty array so app can continue
      return [];
    }
  }

  // PRICE LISTS
  async getPriceLists(): Promise<any[]> {
    try {
      const response = await this.client.get(
        `${API_VERSION}/Price List?fields=["name","price_list_name","currency"]`
      );
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get item price from Item Price doctype
   * Tries multiple price lists: configured default, then "Standard Selling", then any available
   */
async getFlyers(limit: number = 10): Promise<Flyer[]> {
    try {
      // Use only permitted fields (description not queryable in list view)
      const fields = ['name', 'flyer_name', 'image'];
      const response = await this.client.get(`${API_VERSION}/Flyer`, {
        params: {
          fields: JSON.stringify(fields),
          limit_page_length: limit,
          order_by: 'creation desc', // Most recent first
        },
      });
      const flyers = response.data.data || [];
      
      // Log to debug
      console.log(`🖼️ Fetched ${flyers.length} flyers from Flyer doctype`);
      flyers.forEach((flyer: any, index: number) => {
        console.log(`Flyer ${index + 1}:`, {
          name: flyer.name,
          flyer_name: flyer.flyer_name,
          image: flyer.image,
        });
      });
      
      return flyers.map((flyer: any): Flyer => ({
        name: flyer.name,
        flyer_name: flyer.flyer_name,
        image: flyer.image || null,
        description: '',
      }));
    } catch (error) {
      console.warn('Error fetching flyers from Flyer doctype:', error);
      return [];
    }
  }

  async getItemPrice(
    itemCode: string,
    priceListName?: string,
    quantity: number = 1
  ): Promise<number> {
    try {
      // Try configured price list first, then default to "Standard Selling"
      const priceListsToTry = priceListName 
        ? [priceListName]
        : this.config.defaultPriceList
        ? [this.config.defaultPriceList, 'Standard Selling']
        : ['Standard Selling'];
      
      for (const priceList of priceListsToTry) {
        try {
          // Use only price_list field (not price_list_name)
          const filters = [['Item Price', 'item_code', '=', itemCode], ['Item Price', 'price_list', '=', priceList]];
          const fields = ['name', 'price_list_rate', 'price_list', 'item_code'];
          const fieldsStr = JSON.stringify(fields);
          const filtersStr = JSON.stringify(filters);
          
          // Build URL exactly like getWebsiteItems does
          let url = `${API_VERSION}/Item Price?fields=${encodeURIComponent(fieldsStr)}`;
          url += `&filters=${encodeURIComponent(filtersStr)}`;
          url += `&limit_page_length=1`;

          const response = await this.client.get(url);
          if (response.data && response.data.data && response.data.data.length > 0) {
            // Get the first matching price
            const itemPrice = response.data.data[0];
            const price = itemPrice.price_list_rate;
            if (price !== null && price !== undefined && price > 0) {
              console.log(`Found price for ${itemCode} in price list ${priceList}: ${price}`);
              return price;
            }
          }
        } catch (error: any) {
          const errorData = error?.response?.data as ERPNextError | undefined;
          // If it's a JSON decode error, skip this price list
          if (errorData?.exc_type === 'JSONDecodeError') {
            continue;
          }
          // Log error but try next price list
          console.warn(`Failed to fetch price from price list ${priceList} for ${itemCode}:`, error?.message || error);
          continue;
        }
      }
      
      // If no price found in any price list, try to get any price for this item
      try {
        // Use only price_list field (not price_list_name)
        const fields = ['name', 'price_list_rate', 'price_list', 'item_code'];
        const filters = [['Item Price', 'item_code', '=', itemCode]];
        const fieldsStr = JSON.stringify(fields);
        const filtersStr = JSON.stringify(filters);
        
        // Build URL exactly like getWebsiteItems does
        let url = `${API_VERSION}/Item Price?fields=${encodeURIComponent(fieldsStr)}`;
        url += `&filters=${encodeURIComponent(filtersStr)}`;
        url += `&limit_page_length=1`;
        url += `&order_by=modified%20desc`;

        const response = await this.client.get(url);
        if (response.data && response.data.data && response.data.data.length > 0) {
          // Get the most recent price
          const itemPrice = response.data.data[0];
          const price = itemPrice.price_list_rate;
          if (price !== null && price !== undefined && price > 0) {
            console.log(`Found price for ${itemCode} in any price list: ${price} (from ${itemPrice.price_list || 'unknown'})`);
            return price;
          }
        }
      } catch (error: any) {
        const errorData = error?.response?.data as ERPNextError | undefined;
        // If it's a JSON decode error, it's likely an ERPNext server configuration issue
        if (errorData?.exc_type !== 'JSONDecodeError') {
          console.warn(`No price found for item ${itemCode}:`, error?.message || error);
        }
      }
      
      return 0;
    } catch (error) {
      console.warn(`Error fetching price for item ${itemCode}:`, error);
      return 0;
    }
  }

  // PAYMENT ENTRIES
  async createPaymentEntry(paymentData: {
    payment_type: 'Receive' | 'Pay';
    party_type: 'Customer' | 'Supplier';
    party: string;
    company: string;
    posting_date: string;
    amount: number;
    mode_of_payment?: string;
    reference_no?: string;
  }): Promise<any> {
    try {
      const response = await this.client.post(
        `${API_VERSION}/Payment Entry`,
        paymentData
      );
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // ADDRESSES
  async createAddress(addressData: {
    address_title: string;
    address_type: string;
    address_line1: string;
    address_line2?: string;
    city: string;
    county?: string;
    state?: string;
    pincode: string;
    country: string;
    phone?: string;
    email_id?: string;
    fax?: string;
    tax_category?: string;
    is_primary_address?: number;
    is_shipping_address?: number;
    disabled?: number;
    is_your_company_address?: number;
    links?: Array<{
      link_doctype: string;
      link_name: string;
    }>;
  }): Promise<any> {
    try {
      const response = await this.client.post(`${API_VERSION}/Address`, addressData);
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getOrCreateCustomer(userEmail: string, fullName?: string): Promise<any> {
    try {
      // First, resolve by portal user/email mapping (Customer.portal_users.user)
      const existingByPortal = await this.getCustomerByEmail(userEmail);
      if (existingByPortal) {
        return existingByPortal;
      }

      // Customer doesn't exist, create one
      const createResponse = await this.createCustomer({
        customer_name: fullName || userEmail,
        email: userEmail,
        customer_type: 'Individual',
      });
      if (createResponse) {
        return createResponse;
      }
      
      throw new Error('Failed to create customer');
    } catch (error) {
      // If customer creation fails but customer might already exist by name, try to fetch it
      try {
        const fallbackResponse = await this.client.get(`${API_VERSION}/Customer`, {
          params: {
            fields: JSON.stringify(['name', 'customer_name', 'email_id']),
            limit_page_length: 1,
          },
        });
        if (fallbackResponse.data.data && fallbackResponse.data.data.length > 0) {
          return fallbackResponse.data.data[0];
        }
      } catch (fallbackError) {
        // Ignore fallback error
      }
      throw this.handleError(error);
    }
  }

  async getAddresses(customerName: string): Promise<any[]> {
    try {
      // Fetch all addresses, then filter client-side for those linked to this customer
      const response = await this.client.get(`${API_VERSION}/Address`, {
        params: {
          fields: JSON.stringify(['name', 'address_title', 'address_type', 'address_line1', 'address_line2', 'city', 'county', 'state', 'country', 'pincode', 'email_id', 'phone', 'fax', 'tax_category', 'is_primary_address', 'is_shipping_address', 'disabled', 'is_your_company_address', 'links']),
          limit_page_length: 500,
        },
      });
      
      const allAddresses = response.data.data || [];
      
      // Filter addresses that are linked to this customer
      const linkedAddresses = allAddresses.filter((address: any) => {
        if (!address.links || !Array.isArray(address.links)) {
          return false;
        }
        return address.links.some((link: any) => 
          link.link_doctype === 'Customer' && link.link_name === customerName
        );
      });
      
      return linkedAddresses;
    } catch (error) {
      console.warn('Error fetching addresses:', error);
      return [];
    }
  }

  async getAddressesByEmail(userEmail: string): Promise<any[]> {
    try {
      // Preferred lookup: resolve customer's actual name via portal_users and match Address links.
      const customer = await this.getCustomerByEmail(userEmail);

      // Fetch all addresses, then filter by email_id field
      const response = await this.client.get(`${API_VERSION}/Address`, {
        params: {
          fields: JSON.stringify(['name', 'address_title', 'address_type', 'address_line1', 'address_line2', 'city', 'county', 'state', 'country', 'pincode', 'email_id', 'phone', 'fax', 'tax_category', 'is_primary_address', 'is_shipping_address', 'disabled', 'is_your_company_address', 'links']),
          limit_page_length: 500,
        },
      });
      
      const allAddresses = response.data.data || [];
      
      console.log('All addresses from API:', allAddresses);
      console.log('Looking for email:', userEmail);
      
      // Filter addresses linked to resolved customer first; fallback to email-based matching.
      const addressesByEmail = allAddresses.filter((address: any) => {
        if (customer?.name && address.links && Array.isArray(address.links)) {
          const hasCustomerLink = address.links.some((link: any) =>
            link.link_doctype === 'Customer' && link.link_name === customer.name
          );
          if (hasCustomerLink) return true;
        }

        // Check email_id field directly
        if (address.email_id === userEmail) {
          return true;
        }
        
        // Also check if email matches in links (customer links might use email)
        if (address.links && Array.isArray(address.links)) {
          const hasEmailLink = address.links.some((link: any) => 
            link.link_name === userEmail
          );
          if (hasEmailLink) {
            return true;
          }
        }
        
        return false;
      });
      
      console.log('Filtered addresses by email:', addressesByEmail);
      return addressesByEmail;
    } catch (error) {
      console.warn('Error fetching addresses by email:', error);
      return [];
    }
  }

  async updateAddress(addressName: string, addressData: any): Promise<any> {
    try {
      const response = await this.client.put(`${API_VERSION}/Address/${addressName}`, addressData);
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async deleteAddress(addressName: string): Promise<any> {
    try {
      const response = await this.client.delete(`${API_VERSION}/Address/${addressName}`);
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // CATEGORIES / ITEM GROUPS
  async getItemGroups(): Promise<any[]> {
    try {
      const response = await this.client.get(
        `${API_VERSION}/Item Group?fields=["name","item_group_name","image","is_group","parent_item_group"]`
      );
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // PRICING RULES
  /**
   * Fetch all available fields from Pricing Rule doctype
   * Use this to see what fields are available in your ERPNext instance
   */
  async getPricingRuleAllFields(): Promise<any> {
    try {
      const response = await this.client.get(`${API_VERSION}/Pricing Rule`);
      console.log('📋 Pricing Rule Fields Available:', JSON.stringify(response.data.data[0], null, 2));
      return response.data.data[0];
    } catch (error) {
      console.error('Error fetching Pricing Rule fields:', error);
      return null;
    }
  }

  async getPricingRules(): Promise<any[]> {
    try {
      // First, get list of pricing rules
      const listResponse = await this.client.get(`${API_VERSION}/Pricing Rule?limit_page_length=500`);
      const ruleNames = (listResponse.data.data || [])
        .filter((rule: any) => !rule.disable)
        .map((rule: any) => rule.name);
      
      // Fetch each rule individually to get full details (includes all fields including custom fields)
      const fullRules: any[] = [];
      for (const ruleName of ruleNames) {
        try {
          const ruleResponse = await this.client.get(`${API_VERSION}/Pricing Rule/${ruleName}`);
          if (ruleResponse.data.data) {
            const ruleData = ruleResponse.data.data;
            // Log to debug custom_flyer field - check if it exists
            if (ruleData.custom_flyer !== undefined && ruleData.custom_flyer !== null) {
              console.log(`🖼️ Found custom_flyer in ${ruleName}:`, ruleData.custom_flyer, typeof ruleData.custom_flyer);
            } else {
              // Log all field names to help debug
              const allFields = Object.keys(ruleData);
              const customFields = allFields.filter(f => f.startsWith('custom_'));
              if (customFields.length > 0) {
                console.log(`📋 Custom fields in ${ruleName}:`, customFields);
              }
            }
            fullRules.push(ruleData);
          }
        } catch (error) {
          console.warn(`Could not fetch pricing rule details for ${ruleName}`);
        }
      }
      
      // Filter out expired rules
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const activeRules = fullRules.filter((rule: any) => {
        // Check if disabled
        if (rule.disable === 1) {
          return false;
        }
        
        // Check valid_from date
        if (rule.valid_from) {
          const validFrom = new Date(rule.valid_from);
          validFrom.setHours(0, 0, 0, 0);
          if (today < validFrom) {
            return false; // Rule hasn't started yet
          }
        }
        
        // Check valid_upto date
        if (rule.valid_upto) {
          const validUpto = new Date(rule.valid_upto);
          validUpto.setHours(23, 59, 59, 999);
          if (today > validUpto) {
            return false; // Rule has expired
          }
        }
        
        return true; // Rule is active
      });
      
      if (activeRules.length > 0) {
        console.log('💰 PRICING RULES AVAILABLE:', activeRules.length);
        activeRules.forEach((rule: any) => {
          console.log(`\n📌 ${rule.name}: ${rule.discount_percentage}% discount`);
          console.log(`   Apply On: ${rule.apply_on}, Valid: ${rule.valid_from} to ${rule.valid_upto || 'No Expiry'}`);
          
          // Show matching criteria
          if (rule.apply_on === 'Item Group' && rule.item_groups && rule.item_groups.length > 0) {
            console.log(`   📋 Item Groups (${rule.item_groups.length}):`);
            rule.item_groups.forEach((ig: any) => {
              console.log(`      - ${ig.item_group}`);
            });
          }
          
          if (rule.apply_on === 'Item Code' && rule.items && rule.items.length > 0) {
            console.log(`   📋 Item Codes (${rule.items.length}):`);
            rule.items.forEach((item: any) => {
              console.log(`      - ${item.item_code}`);
            });
          }
        });
      }
      
      // Log if any rules were filtered out
      const expiredCount = fullRules.length - activeRules.length;
      if (expiredCount > 0) {
        console.log(`⚠️  Filtered out ${expiredCount} expired or inactive pricing rule(s)`);
      }
      
      return activeRules;
    } catch (error) {
      console.warn('Error fetching pricing rules:', error);
      return [];
    }
  }

  async getItemsByGroup(groupName: string, limit: number = 50): Promise<any[]> {
    // Use Website Item instead of Item for better eCommerce support
    return this.getWebsiteItemsByGroup(groupName, limit);
  }

  // Raw Item doctype list (non-Website Item) for sourcing flows
  async getRawItemsByGroup(groupName: string, limit: number = 200): Promise<any[]> {
    try {
      const fields = ['name', 'item_name', 'item_group', 'disabled', 'image'];
      const filters = [['Item', 'item_group', '=', groupName]];
      let url = `${API_VERSION}/Item?fields=${encodeURIComponent(JSON.stringify(fields))}`;
      url += `&filters=${encodeURIComponent(JSON.stringify(filters))}`;
      url += `&limit_page_length=${limit}`;
      const response = await this.client.get(url);
      return response.data.data || [];
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Items from Item doctype where `item_group` is one of the given groups (e.g. parent + descendants).
   * Excludes disabled items. Used for category thumbnails from Item.image, not Website Item.
   */
  async getRawItemsByGroups(groupNames: string[], limit: number = 200): Promise<any[]> {
    const fields = ['name', 'item_name', 'item_group', 'disabled', 'image'];
    const unique = [...new Set(groupNames)].filter(Boolean);
    if (unique.length === 0) return [];

    const chunkSize = 40;
    const all: any[] = [];
    try {
      for (let i = 0; i < unique.length; i += chunkSize) {
        const chunk = unique.slice(i, i + chunkSize);
        const filters = [
          ['Item', 'disabled', '=', 0],
          ['Item', 'item_group', 'in', chunk],
        ];
        let url = `${API_VERSION}/Item?fields=${encodeURIComponent(JSON.stringify(fields))}`;
        url += `&filters=${encodeURIComponent(JSON.stringify(filters))}`;
        url += `&limit_page_length=${limit}`;
        const response = await this.client.get(url);
        const rows = response.data.data || [];
        all.push(...rows);
      }
      return all;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getCompanies(limit: number = 20): Promise<any[]> {
    try {
      const fields = ['name'];
      let url = `${API_VERSION}/Company?fields=${encodeURIComponent(JSON.stringify(fields))}`;
      url += `&limit_page_length=${limit}`;
      const response = await this.client.get(url);
      return response.data.data || [];
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Upload image/file and attach it to a document (e.g. Sales Order)
   */
  async uploadFileToDoc(
    fileUri: string,
    fileName: string,
    doctype: string,
    docname: string,
    isPrivate: boolean = true
  ): Promise<any> {
    try {
      const formData = new FormData();
      formData.append('doctype', doctype);
      formData.append('docname', docname);
      formData.append('is_private', isPrivate ? '1' : '0');
      formData.append('folder', 'Home/Attachments');
      formData.append('file', {
        // React Native file payload
        uri: fileUri,
        name: fileName,
        type: 'image/jpeg',
      } as any);

      const response = await this.client.post('/api/method/upload_file', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async updateSalesOrder(orderName: string, data: Record<string, any>): Promise<any> {
    try {
      const response = await this.client.put(
        `${API_VERSION}/Sales Order/${orderName}?ignore_version=1`,
        data
      );
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get a session-based axios client for user-specific operations
   * Uses cookies/session instead of API key for user permissions
   */
  private getSessionClient(): AxiosInstance {
    return axios.create({
      baseURL: this.config.baseUrl,
      timeout: getCurrentTimeout(),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      withCredentials: true, // Use session cookies for user-specific operations
    });
  }

  // WISHLIST
  /**
   * Get wishlist for a specific user
   * Fetches the Wishlist document with items child table
   * Uses session-based authentication (user's login session)
   * Parent DocType: Wishlist
   *   - user (Link field)
   *   - items (Table/Child Table)
   * Child Table: Wishlist Item
   *   - item (Link field)
   *   - qty (Int field)
   *   - notes (Data field, optional)
   */
  async getWishlist(userEmail: string): Promise<any> {
    try {
      // Use session client for user-specific operations
      const sessionClient = this.getSessionClient();
      
      console.log('Fetching wishlist for user:', userEmail);
      
      // First, get the wishlist name by querying with filters
      const listResponse = await sessionClient.get(`${API_VERSION}/Wishlist`, {
        params: {
          fields: JSON.stringify(['name', 'user']),
          filters: JSON.stringify([
            ['Wishlist', 'user', '=', userEmail]
          ]),
          limit_page_length: 1,
        },
      });
      
      if (!listResponse.data.data || listResponse.data.data.length === 0) {
        console.log('No wishlist found for user:', userEmail);
        return null;
      }
      
      const wishlistName = listResponse.data.data[0].name;
      console.log('Found wishlist name:', wishlistName);
      
      // Fetch the full wishlist document by name to get child table data
      // ERPNext child tables are typically only available when fetching a single document by name
      const response = await sessionClient.get(`${API_VERSION}/Wishlist/${wishlistName}`);
      
      if (response.data.data) {
        const wishlist = response.data.data;
        
        console.log('Wishlist fetched:', {
          name: wishlist.name,
          user: wishlist.user,
          itemsCount: wishlist.items?.length || 0,
          items: wishlist.items,
          allKeys: Object.keys(wishlist),
        });
        
        // Check for child table in different possible formats
        // ERPNext might return child tables with different names
        let items = wishlist.items;
        
        // Try alternative child table names
        if (!items || !Array.isArray(items) || items.length === 0) {
          const possibleTableNames = ['items', 'wishlist_items', 'wishlist_item', 'item'];
          for (const tableName of possibleTableNames) {
            if (wishlist[tableName] && Array.isArray(wishlist[tableName]) && wishlist[tableName].length > 0) {
              console.log(`Found items in alternative table name: ${tableName}`);
              items = wishlist[tableName];
              break;
            }
          }
        }
        
        // Ensure items is an array
        if (!items || !Array.isArray(items)) {
          console.log('Items is not an array, initializing empty array');
          items = [];
        }
        
        // Attach items to wishlist object
        wishlist.items = items;
        
        console.log('Final wishlist:', {
          name: wishlist.name,
          user: wishlist.user,
          itemsCount: wishlist.items.length,
          items: wishlist.items,
        });
        
        return wishlist;
      }
      
      console.log('No wishlist data in response');
      return null;
    } catch (error) {
      console.error('Error fetching wishlist:', error);
      // If wishlist doesn't exist, return null instead of throwing
      if ((error as any)?.response?.status === 404 || (error as any)?.response?.status === 417) {
        console.log('Wishlist not found (404/417), returning null');
        return null;
      }
      throw this.handleError(error);
    }
  }

  /**
   * Create a new wishlist for a user
   * Creates a Wishlist document with:
   *   - user: userEmail (Link field)
   *   - items: [] (Child table - empty initially)
   * 
   * Child table structure (Wishlist Item):
   *   - item: Link to Item doctype
   *   - qty: Integer (quantity)
   *   - notes: Data/Text (optional notes)
   */
  async createWishlist(userEmail: string): Promise<any> {
    try {
      // Use session client for user-specific operations
      const sessionClient = this.getSessionClient();
      
      const wishlistData = {
        user: userEmail, // Link field to User doctype
        items: [], // Child table - empty array initially
      };
      
      console.log('Creating wishlist for user:', userEmail);
      const response = await sessionClient.post(`${API_VERSION}/Wishlist`, wishlistData);
      console.log('Wishlist created successfully:', response.data.data?.name);
      
      // Ensure items array is initialized
      if (!response.data.data.items) {
        response.data.data.items = [];
      }
      
      return response.data.data;
    } catch (error) {
      console.error('Error creating wishlist:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Add item to wishlist
   * If wishlist doesn't exist, creates it first
   * 
   * Structure:
   *   Parent DocType: Wishlist
   *     - user: userEmail (Link field)
   *     - items: Child table array
   *   
   *   Child Table Row (Wishlist Item):
   *     - item: itemCode (Link to Item doctype)
   *     - qty: qty (Integer)
   *     - notes: notes (Data/Text, optional)
   */
  async addToWishlist(userEmail: string, itemCode: string, qty: number = 1, notes?: string): Promise<any> {
    try {
      // Get existing wishlist or create new one
      let wishlist = await this.getWishlist(userEmail);
      
      if (!wishlist) {
        console.log('Wishlist not found, creating new wishlist for user:', userEmail);
        wishlist = await this.createWishlist(userEmail);
      }
      
      // Ensure items array exists
      if (!wishlist.items || !Array.isArray(wishlist.items)) {
        wishlist.items = [];
      }
      
      // Check if item already exists in wishlist
      // Note: ERPNext child table uses 'item_code' field name, not 'item'
      const existingItem = wishlist.items.find((item: any) => 
        (item.item_code || item.item) === itemCode
      );
      
      if (existingItem) {
        // Update existing item in child table
        const updatedItems = wishlist.items.map((item: any) => 
          (item.item_code || item.item) === itemCode 
            ? { 
                ...item, 
                item_code: itemCode, // Link field (ERPNext uses item_code)
                qty: qty, // Int field
                notes: notes || item.notes || '' // Data field (optional)
              }
            : item
        );
        
        // Use session client for user-specific operations
        const sessionClient = this.getSessionClient();
        
        console.log('Updating existing wishlist item:', itemCode);
        const response = await sessionClient.put(`${API_VERSION}/Wishlist/${wishlist.name}`, {
          items: updatedItems, // Child table array
        });
        
        // Ensure response has items array
        if (response.data.data && !response.data.data.items) {
          response.data.data.items = updatedItems;
        }
        
        return response.data.data;
      } else {
        // Add new item to child table
        // Note: ERPNext child table uses 'item_code' field name
        const newItem = {
          item_code: itemCode, // Link field to Item doctype (ERPNext uses item_code)
          qty: qty, // Int field
          notes: notes || '', // Data field (optional)
        };
        
        const updatedItems = [...wishlist.items, newItem];
        
        // Use session client for user-specific operations
        const sessionClient = this.getSessionClient();
        
        console.log('Adding new item to wishlist:', itemCode, 'Total items:', updatedItems.length);
        const response = await sessionClient.put(`${API_VERSION}/Wishlist/${wishlist.name}`, {
          items: updatedItems, // Child table array
        });
        
        // Ensure response has items array
        if (response.data.data && !response.data.data.items) {
          response.data.data.items = updatedItems;
        }
        
        return response.data.data;
      }
    } catch (error) {
      console.error('Error adding to wishlist:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Remove item from wishlist
   * Removes an item from the items child table
   */
  async removeFromWishlist(userEmail: string, itemCode: string): Promise<any> {
    try {
      const wishlist = await this.getWishlist(userEmail);
      
      if (!wishlist) {
        throw new Error('Wishlist not found');
      }
      
      // Ensure items array exists
      if (!wishlist.items || !Array.isArray(wishlist.items)) {
        wishlist.items = [];
      }
      
      // Filter out the item from child table
      // Note: ERPNext child table uses 'item_code' field name, not 'item'
      const updatedItems = wishlist.items.filter((item: any) => 
        (item.item_code || item.item) !== itemCode
      );
      
      // Use session client for user-specific operations
      const sessionClient = this.getSessionClient();
      
      console.log('Removing item from wishlist:', itemCode, 'Remaining items:', updatedItems.length);
      const response = await sessionClient.put(`${API_VERSION}/Wishlist/${wishlist.name}`, {
        items: updatedItems, // Child table array
      });
      
      // Ensure response has items array
      if (response.data.data && !response.data.data.items) {
        response.data.data.items = updatedItems;
      }
      
      return response.data.data;
    } catch (error) {
      console.error('Error removing from wishlist:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Clear entire wishlist
   */
  async clearWishlist(userEmail: string): Promise<any> {
    try {
      const wishlist = await this.getWishlist(userEmail);
      
      if (!wishlist) {
        return null;
      }
      
      // Use session client for user-specific operations
      const sessionClient = this.getSessionClient();
      
      const response = await sessionClient.put(`${API_VERSION}/Wishlist/${wishlist.name}`, {
        items: [],
      });
      return response.data.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get all reviews for a specific Website Item
   * @param websiteItemName - The name (ID) of the Website Item
   * @returns Array of review documents
   */
  async getItemReviews(websiteItemName: string): Promise<any[]> {
    try {
      const response = await this.client.get(
        `${API_VERSION}/Item Review?filters=[["website_item","=","${websiteItemName}"]]&fields=["name","website_item","user","customer","review_title","rating","custom_rating_float","comment","published_on","creation"]&order_by=creation desc&limit_page_length=100`
      );
      
      if (response.data && response.data.data) {
        // Debug: Log raw rating values from ERPNext
        console.log('Raw reviews from ERPNext:', response.data.data.map((r: any) => ({
          name: r.name,
          rating: r.rating,
          custom_rating_float: r.custom_rating_float,
          ratingType: typeof r.rating,
          customRatingFloatType: typeof r.custom_rating_float,
        })));
        return response.data.data;
      }
      return [];
    } catch (error) {
      console.error('Error fetching item reviews:', error);
      return [];
    }
  }

  /**
   * Create a new review for a Website Item
   * Requires session authentication (user must be logged in)
   * @param websiteItemName - The name (ID) of the Website Item
   * @param userEmail - The email of the logged-in user
   * @param reviewData - Review data including rating, title, comment
   * @returns Created review document
   */
  async createItemReview(
    websiteItemName: string,
    userEmail: string,
    reviewData: {
      rating: number;
      review_title: string;
      comment: string;
    }
  ): Promise<any> {
    if (!userEmail) {
      throw new Error('User email is required to create a review');
    }

    const sessionClient = this.getSessionClient();

    // Ensure rating is sent as a float number to custom_rating_float field
    // Convert to float explicitly
    let ratingValue = 0;
    if (typeof reviewData.rating === 'number') {
      ratingValue = reviewData.rating;
    } else if (typeof reviewData.rating === 'string') {
      ratingValue = parseFloat(reviewData.rating) || 0;
    }
    
    // Ensure rating is between 1 and 5
    const normalizedRating = Math.max(1.0, Math.min(5.0, ratingValue));
    
    // Convert to float explicitly
    const floatRating = parseFloat(normalizedRating.toFixed(1));

    // Debug: Log what we're sending
    console.log('Creating review with rating:', {
      original: reviewData.rating,
      originalType: typeof reviewData.rating,
      normalized: floatRating,
      normalizedType: typeof floatRating,
      value: floatRating,
    });

    // Create the review document
    // Use custom_rating_float field (Float field type) to store rating
    const reviewPayload = {
      website_item: websiteItemName,
      user: userEmail,
      custom_rating_float: floatRating, // Send as float to custom_rating_float field
      review_title: reviewData.review_title,
      comment: reviewData.comment,
      published_on: new Date().toISOString().split('T')[0], // Today's date in YYYY-MM-DD format
    };

    console.log('Review payload being sent to ERPNext:', JSON.stringify(reviewPayload, null, 2));

    const response = await sessionClient.post(`${API_VERSION}/Item Review`, reviewPayload);
    return response.data.data;
  }

  /**
   * Get shopping cart for a user
   * Fetches the Shopping Cart document for the given user email
   * Structure:
   *   - user: userEmail (Link field)
   *   - items: Child table array with:
   *     - item_code: Link to Item doctype
   *     - quantity: Integer
   */
  async getShoppingCart(userEmail: string): Promise<any> {
    try {
      const sessionClient = this.getSessionClient();
      
      // First, query for the cart by user email
      const queryResponse = await sessionClient.get(
        `${API_VERSION}/Shopping Cart?filters=[["user","=","${userEmail}"]]&fields=["name","user"]&limit_page_length=1`
      );
      
      if (!queryResponse.data || !queryResponse.data.data || queryResponse.data.data.length === 0) {
        console.log('No shopping cart found for user:', userEmail);
        return null;
      }
      
      const cartName = queryResponse.data.data[0].name;
      console.log('Found shopping cart:', cartName);
      
      // Fetch the full cart document by name to get child table data
      const response = await sessionClient.get(`${API_VERSION}/Shopping Cart/${cartName}`);
      
      if (response.data && response.data.data) {
        const cart = response.data.data;
        
        // Ensure items array exists
        let items = cart.items || [];
        
        // Handle different possible field names for child table
        if (!items || !Array.isArray(items)) {
          // Try alternative field names
          items = cart.items_table || cart.cart_items || [];
        }
        
        // Ensure items is an array
        if (!items || !Array.isArray(items)) {
          console.log('Items is not an array, initializing empty array');
          items = [];
        }
        
        // Attach items to cart object
        cart.items = items;
        
        console.log('Final shopping cart:', {
          name: cart.name,
          user: cart.user,
          itemsCount: cart.items.length,
          items: cart.items,
        });
        
        return cart;
      }
      
      console.log('No cart data in response');
      return null;
    } catch (error) {
      console.error('Error fetching shopping cart:', error);
      // If cart doesn't exist, return null instead of throwing
      if ((error as any)?.response?.status === 404 || (error as any)?.response?.status === 417) {
        console.log('Shopping cart not found (404/417), returning null');
        return null;
      }
      throw this.handleError(error);
    }
  }

  /**
   * Create a new shopping cart for a user
   * Creates a Shopping Cart document with:
   *   - user: userEmail (Link field)
   *   - items: [] (Child table - empty initially)
   */
  async createShoppingCart(userEmail: string): Promise<any> {
    try {
      const sessionClient = this.getSessionClient();
      
      const cartData = {
        user: userEmail, // Link field to User doctype
        items: [], // Child table - empty array initially
      };
      
      console.log('Creating shopping cart for user:', userEmail);
      const response = await sessionClient.post(`${API_VERSION}/Shopping Cart`, cartData);
      console.log('Shopping cart created successfully:', response.data.data?.name);
      
      // Ensure items array is initialized
      if (!response.data.data.items) {
        response.data.data.items = [];
      }
      
      return response.data.data;
    } catch (error) {
      console.error('Error creating shopping cart:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Add item to shopping cart
   * If cart doesn't exist, creates it first
   * 
   * Structure:
   *   Parent DocType: Shopping Cart
   *     - user: userEmail (Link field)
   *     - items: Child table array
   *   
   *   Child Table Row:
   *     - item_code: itemCode (Link to Item doctype)
   *     - quantity: quantity (Integer)
   *     - description: description (Text/Data field - e.g., selected size)
   */
  async addToCart(userEmail: string, itemCode: string, quantity: number = 1, description?: string): Promise<any> {
    try {
      // Get existing cart or create new one
      let cart = await this.getShoppingCart(userEmail);
      
      if (!cart) {
        console.log('Shopping cart not found, creating new cart for user:', userEmail);
        cart = await this.createShoppingCart(userEmail);
      }
      
      // Ensure items array exists
      if (!cart.items || !Array.isArray(cart.items)) {
        cart.items = [];
      }
      
      // Check if item already exists in cart
      const existingItemIndex = cart.items.findIndex(
        (item: any) => item.item_code === itemCode || item.item === itemCode
      );
      
      const sessionClient = this.getSessionClient();
      
      if (existingItemIndex >= 0) {
        // Update existing item - preserve all existing fields including 'name' (row identifier)
        const existingItem = cart.items[existingItemIndex];
        cart.items[existingItemIndex] = {
          ...existingItem, // Preserve all existing fields (name, doctype, parent, etc.)
          item_code: itemCode,
          quantity: (existingItem.quantity || 0) + quantity,
          description: description || existingItem.description || '', // Update description if provided
        };
        console.log('Updating existing item in cart:', itemCode, 'new quantity:', cart.items[existingItemIndex].quantity, 'description:', description);
      } else {
        // Add new item to cart - don't include 'name' field (ERPNext will generate it)
        cart.items.push({
          item_code: itemCode,
          quantity: quantity,
          description: description || '', // Include description field (e.g., selected size)
        });
        console.log('Adding new item to cart:', itemCode, 'quantity:', quantity, 'description:', description);
      }
      
      // Update cart in ERPNext
      const updatePayload = {
        items: cart.items,
      };
      
      const response = await sessionClient.put(`${API_VERSION}/Shopping Cart/${cart.name}`, updatePayload);
      console.log('Cart updated successfully');
      
      return response.data.data;
    } catch (error) {
      console.error('Error adding to cart:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Remove item from shopping cart
   * Removes an item from the cart's items child table
   */
  async removeFromCart(userEmail: string, itemCode: string): Promise<any> {
    try {
      const cart = await this.getShoppingCart(userEmail);
      
      if (!cart) {
        throw new Error('Shopping cart not found');
      }
      
      // Ensure items array exists
      if (!cart.items || !Array.isArray(cart.items)) {
        cart.items = [];
      }
      
      // Remove item from cart
      cart.items = cart.items.filter(
        (item: any) => item.item_code !== itemCode && item.item !== itemCode
      );
      
      const sessionClient = this.getSessionClient();
      
      // Update cart in ERPNext
      const updatePayload = {
        items: cart.items,
      };
      
      const response = await sessionClient.put(`${API_VERSION}/Shopping Cart/${cart.name}`, updatePayload);
      console.log('Item removed from cart successfully');
      
      return response.data.data;
    } catch (error) {
      console.error('Error removing from cart:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Update item quantity in shopping cart
   */
  async updateCartItemQuantity(userEmail: string, itemCode: string, quantity: number): Promise<any> {
    try {
      const cart = await this.getShoppingCart(userEmail);
      
      if (!cart) {
        throw new Error('Shopping cart not found');
      }
      
      // Ensure items array exists
      if (!cart.items || !Array.isArray(cart.items)) {
        cart.items = [];
      }
      
      // Find and update item
      const itemIndex = cart.items.findIndex(
        (item: any) => item.item_code === itemCode || item.item === itemCode
      );
      
      if (itemIndex < 0) {
        throw new Error('Item not found in cart');
      }
      
      if (quantity <= 0) {
        // Remove item if quantity is 0 or less
        return await this.removeFromCart(userEmail, itemCode);
      }
      
      cart.items[itemIndex].quantity = quantity;
      
      const sessionClient = this.getSessionClient();
      
      // Update cart in ERPNext
      const updatePayload = {
        items: cart.items,
      };
      
      const response = await sessionClient.put(`${API_VERSION}/Shopping Cart/${cart.name}`, updatePayload);
      console.log('Cart item quantity updated successfully');
      
      return response.data.data;
    } catch (error) {
      console.error('Error updating cart item quantity:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Clear all items from shopping cart
   */
  async clearCart(userEmail: string): Promise<any> {
    try {
      const cart = await this.getShoppingCart(userEmail);
      
      if (!cart) {
        return null; // Cart doesn't exist, nothing to clear
      }
      
      const sessionClient = this.getSessionClient();
      
      // Clear items array
      const updatePayload = {
        items: [],
      };
      
      const response = await sessionClient.put(`${API_VERSION}/Shopping Cart/${cart.name}`, updatePayload);
      console.log('Cart cleared successfully');
      
      return response.data.data;
    } catch (error) {
      console.error('Error clearing cart:', error);
      throw this.handleError(error);
    }
  }

  // UTILITIES
  private handleError(error: any): Error {
    // Handle network errors
    if (error.code === 'ECONNABORTED') {
      return new Error('Request timeout. The server took too long to respond. Please try again.');
    }
    if (error.message === 'Network Error' || error.code === 'ERR_NETWORK') {
      return new Error('Network error. Please check your internet connection and try again.');
    }
    if (error.code === 'ERR_CANCELED') {
      return new Error('Request was cancelled.');
    }
    
    // Handle API response errors
    if (error.response?.data) {
      const erpError = error.response.data as ERPNextError;
      
      // Try to extract message from _server_messages
      if (erpError._server_messages) {
        try {
          const serverMessages = JSON.parse(erpError._server_messages);
          if (Array.isArray(serverMessages) && serverMessages.length > 0) {
            const firstMessage = JSON.parse(serverMessages[0]);
            if (firstMessage?.message) {
              return new Error(firstMessage.message);
            }
          }
        } catch (parseError) {
          // If parsing fails, try to extract message from string
          const serverMessages = erpError._server_messages;
          if (typeof serverMessages === 'string') {
            const match = serverMessages.match(/"message":\s*"([^"]+)"/);
            if (match && match[1]) {
              return new Error(match[1]);
            }
          }
        }
      }
      
      return new Error(
        erpError.message || erpError.exc || 'ERPNext API Error'
      );
    }
    
    // Handle other errors
    if (error.message) {
      return error instanceof Error ? error : new Error(error.message);
    }
    
    return new Error('Unknown error occurred. Please try again.');
  }

  async testConnection(): Promise<boolean> {
    try {
      // Test connection using Website Item (primary doctype for eCommerce)
      const response = await this.client.get(`${API_VERSION}/Website Item?limit_page_length=1`);
      return response.status === 200;
    } catch (error) {
      console.error('ERPNext connection test failed:', error);
      return false;
    }
  }

  /**
   * Get random Product Bundles with their child table items
   * Returns bundles with their component items
   */
  async getProductBundles(limit: number = 10): Promise<Array<{
    bundleName: string;
    newItemCode: string;
    customCustomer?: string;
    items: Array<{
      itemCode: string;
      itemName?: string;
      image?: string | null;
    }>;
  }>> {
    try {
      // Fetch all Product Bundles
      const listResponse = await this.client.get(`${API_VERSION}/Product Bundle?limit_page_length=500`);
      const bundleNames = (listResponse.data.data || [])
        .map((bundle: any) => bundle.name)
        .filter((name: string) => name);

      // Shuffle and get random bundles
      const shuffled = bundleNames.sort(() => 0.5 - Math.random());
      const selectedBundles = shuffled.slice(0, limit);

      const bundlesWithItems: Array<{
        bundleName: string;
        newItemCode: string;
        customCustomer?: string;
        items: Array<{
          itemCode: string;
          itemName?: string;
          image?: string | null;
        }>;
      }> = [];

      // Fetch each bundle with its child table
      for (const bundleName of selectedBundles) {
        try {
          const bundleResponse = await this.client.get(
            `${API_VERSION}/Product Bundle/${bundleName}?fields=["*"]`
          );
          
          if (bundleResponse.data.data) {
            const bundle = bundleResponse.data.data;
            const newItemCode = bundle.new_item_code;
            
            // Find child table - try common names
            const childTableNames = [
              'items',
              'product_bundle_item',
              'product_bundle_items',
              'bundle_items',
              'bundle_item'
            ];
            
            let childTable: any[] = [];
            for (const tableName of childTableNames) {
              if (bundle[tableName] && Array.isArray(bundle[tableName])) {
                childTable = bundle[tableName];
                break;
              }
            }
            
            // If no standard name found, look for any array property
            if (childTable.length === 0) {
              for (const key in bundle) {
                if (Array.isArray(bundle[key]) && bundle[key].length > 0) {
                  const firstItem = bundle[key][0];
                  if (firstItem && typeof firstItem === 'object' && firstItem.item_code) {
                    childTable = bundle[key];
                    break;
                  }
                }
              }
            }
            
            // Extract items from child table
            const items = childTable
              .map((row: any) => ({
                itemCode: row.item_code || row.item,
                itemName: row.item_name,
              }))
              .filter((item: any) => item.itemCode);
            
            if (items.length > 0) {
              bundlesWithItems.push({
                bundleName: bundle.name || bundleName,
                newItemCode: newItemCode || '',
                customCustomer: bundle.custom_customer || bundle.customCustomer || undefined,
                items: items,
              });
            }
          }
        } catch (error) {
          console.warn(`Could not fetch Product Bundle ${bundleName}:`, error);
        }
      }

      // Fetch images for items
      for (const bundle of bundlesWithItems) {
        for (const item of bundle.items) {
          try {
            // Try to get Website Item to get the image
            const filters = [['Website Item', 'item_code', '=', item.itemCode]];
            const websiteItems = await this.getWebsiteItems(filters, 1);
            if (websiteItems.length > 0) {
              item.image = websiteItems[0].website_image || websiteItems[0].thumbnail || null;
              item.itemName = websiteItems[0].item_name || websiteItems[0].web_item_name || item.itemName;
            }
          } catch (error) {
            // If Website Item not found, try Item doctype
            try {
              const itemResponse = await this.client.get(`${API_VERSION}/Item/${item.itemCode}`);
              if (itemResponse.data.data) {
                item.image = itemResponse.data.data.image || null;
                item.itemName = itemResponse.data.data.item_name || item.itemName;
              }
            } catch (itemError) {
              // Item not found, keep image as null
            }
          }
        }
      }

      return bundlesWithItems;
    } catch (error) {
      console.error('Error fetching Product Bundles:', error);
      return [];
    }
  }
}

let erpNextClient: ERPNextClient | null = null;
let erpNextBaseUrl: string = ERPNEXT_BASE_URL; // Default to env variable

export const initializeERPNext = (config: ERPNextConfig): ERPNextClient => {
  erpNextClient = new ERPNextClient(config);
  erpNextBaseUrl = config.baseUrl; // Store the base URL when initializing
  return erpNextClient;
};

export const getERPNextClient = (): ERPNextClient => {
  if (!erpNextClient) {
    throw new Error('ERPNext client not initialized. Call initializeERPNext first.');
  }
  return erpNextClient;
};

/**
 * Get the ERPNext base URL for constructing file paths
 */
export const getERPNextBaseUrl = (): string => {
  return erpNextBaseUrl;
};

export default ERPNextClient;
