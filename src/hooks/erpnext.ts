/**
 * Custom Hooks for ERPNext Data Fetching
 * Catalog lists use Item doctype (Item.image); Website Item is optional
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getERPNextClient } from '../services/erpnext';
import { useUserSession } from '../context/UserContext';
import {
  mapERPItemToProduct,
  mapERPSalesOrderToOrder,
  mapERPItemGroupToCategory,
  mapERPCustomerToUser,
  mapERPWishlistToWishlistItems,
  mapERPItemReviewToProductReview,
  mapERPSalesInvoiceToSalesInvoice,
} from '../services/mappers';
import { Product, Order, Category, User, WishlistItem, ProductReview, SalesInvoice } from '../types';
import { getProductDiscount } from '../utils/pricingRules';

// Types
interface UseAsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Utility function to shuffle an array randomly
 */
const shuffleArray = <T,>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

/**
 * Hook for fetching new arrivals (latest Website Items) with infinite scroll
 */
export const useNewArrivals = (pageSize: number = 20, sortByPrice?: 'asc' | 'desc') => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [initialLoad, setInitialLoad] = useState(true);

  // Load initial products
  useEffect(() => {
    const loadInitialProducts = async () => {
      if (!initialLoad) return;

      setLoading(true);
      setError(null);
      
      try {
        const client = getERPNextClient();
        // Fetch first batch of new arrivals
        const websiteItems = await client.getNewArrivals(pageSize, sortByPrice);
        const mappedProducts = websiteItems.map((item) => mapERPItemToProduct(item));
        
        // Randomize products only when not sorting by price
        const finalProducts = sortByPrice ? mappedProducts : shuffleArray(mappedProducts);
        
        setProducts(finalProducts);
        setOffset(pageSize);
        setHasMore(websiteItems.length === pageSize);
        setInitialLoad(false);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setLoading(false);
      }
    };

    loadInitialProducts();
  }, [initialLoad, pageSize, sortByPrice]);

  // Load more products (for infinite scroll)
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || initialLoad) return;

    setLoadingMore(true);
    setError(null);

    try {
      const client = getERPNextClient();
      // For new arrivals, we need to fetch more items with offset
      // Since getNewArrivals doesn't support offset, we'll use getWebsiteItems 
      // with creation date sorting (newest first) to maintain the "new arrivals" order
      const filters = [['Website Item', 'published', '=', 1]];
      // 4th arg is orderBy (not sortByPrice); 5th is sortByPrice for price-sorted lists
      const websiteItems = await client.getWebsiteItems(
        filters,
        pageSize,
        offset,
        sortByPrice ? undefined : 'creation desc',
        sortByPrice
      );
      const mappedProducts = websiteItems.map((item) => mapERPItemToProduct(item));
      
      // Randomize products only when not sorting by price
      const finalProducts = sortByPrice ? mappedProducts : shuffleArray(mappedProducts);
      
      setProducts((prev) => [...prev, ...finalProducts]);
      setOffset((prev) => prev + pageSize);
      setHasMore(websiteItems.length === pageSize);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, offset, pageSize, initialLoad, sortByPrice]);

  // Refresh function to reload from start
  const refresh = useCallback(() => {
    setProducts([]);
    setOffset(0);
    setHasMore(true);
    setInitialLoad(true);
    setError(null);
  }, []);

  return {
    products,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
  };
};

/**
 * Hook for fetching products by category with pagination support
 */
export const useProductsByCategory = (categoryId: string, pageSize: number = 20, sortByPrice?: 'asc' | 'desc') => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [initialLoad, setInitialLoad] = useState(true);

  // Load initial products
  useEffect(() => {
    const loadInitialProducts = async () => {
      // Don't fetch if categoryId is empty
      if (!categoryId || categoryId.trim() === '') {
        setProducts([]);
        setLoading(false);
        setHasMore(false);
        setInitialLoad(false);
        return;
      }

      if (!initialLoad) return;

      setLoading(true);
      setError(null);
      
      try {
        const client = getERPNextClient();
        const websiteItems = await client.getWebsiteItemsByGroup(categoryId, pageSize, 0, sortByPrice);
        const mappedProducts = websiteItems.map((item) => mapERPItemToProduct(item));
        
        // Randomize products only when not sorting by price
        const finalProducts = sortByPrice ? mappedProducts : shuffleArray(mappedProducts);
        
        setProducts(finalProducts);
        setOffset(finalProducts.length);
        setHasMore(finalProducts.length === pageSize);
        setInitialLoad(false);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setProducts([]);
        setHasMore(false);
        setInitialLoad(false);
      } finally {
        setLoading(false);
      }
    };

    loadInitialProducts();
  }, [categoryId, pageSize, sortByPrice, initialLoad]);

  // Load more products (for infinite scroll)
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || initialLoad || !categoryId || categoryId.trim() === '') {
      return;
    }

    setLoadingMore(true);
    setError(null);

    try {
      const client = getERPNextClient();
      const websiteItems = await client.getWebsiteItemsByGroup(categoryId, pageSize, offset, sortByPrice);
      const mappedProducts = websiteItems.map((item) => mapERPItemToProduct(item));
      
      // Randomize products only when not sorting by price
      const finalProducts = sortByPrice ? mappedProducts : shuffleArray(mappedProducts);
      
      setProducts((prev) => [...prev, ...finalProducts]);
      setOffset((prev) => prev + finalProducts.length);
      setHasMore(finalProducts.length === pageSize);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, offset, pageSize, initialLoad, categoryId, sortByPrice]);

  // Refresh function to reload from start
  const refresh = useCallback(() => {
    setProducts([]);
    setOffset(0);
    setHasMore(true);
    setInitialLoad(true);
    setError(null);
  }, []);

  return {
    data: products,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
  };
};

/**
 * Hook for fetching products with pagination and filtering
 */
export const useProducts = (
  filters?: any,
  limit: number = 20,
  offset: number = 0
) => {
  const [state, setState] = useState<UseAsyncState<Product[]>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        const client = getERPNextClient();
        const websiteItems = await client.getWebsiteItems(filters, limit, offset);
        const products = websiteItems.map((item) => mapERPItemToProduct(item));
        setState({ data: products, loading: false, error: null });
      } catch (error) {
        setState({
          data: null,
          loading: false,
          error: error instanceof Error ? error : new Error('Unknown error'),
        });
      }
    };

    fetchProducts();
  }, [filters, limit, offset]);

  return state;
};

/**
 * Hook for searching products
 */
export const useSearchProducts = (query: string) => {
  const [state, setState] = useState<UseAsyncState<Product[]>>({
    data: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!query.trim()) {
      setState({ data: [], loading: false, error: null });
      return;
    }

    let isMounted = true;
    let debounceTimer: NodeJS.Timeout;

    const searchProducts = async () => {
      if (!isMounted) return;
      
      try {
        if (isMounted) {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        }
        const client = getERPNextClient();
        const websiteItems = await client.searchItems(query);
        
        if (isMounted) {
        const products = websiteItems.map((item) => mapERPItemToProduct(item));
        // Randomize search results
        const randomizedProducts = shuffleArray(products);
        setState({ data: randomizedProducts, loading: false, error: null });
        }
      } catch (error) {
        if (isMounted) {
        setState({
          data: null,
          loading: false,
          error: error instanceof Error ? error : new Error('Unknown error'),
        });
      }
      }
    };

    debounceTimer = setTimeout(searchProducts, 500);
    
    return () => {
      isMounted = false;
      clearTimeout(debounceTimer);
    };
  }, [query]);

  return state;
};

/**
 * Hook for fetching a single product
 */
export const useProduct = (productId: string) => {
  const [state, setState] = useState<UseAsyncState<Product>>({
    data: null,
    loading: true,
    error: null,
  });
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!productId) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    let isMounted = true;

    const fetchProduct = async () => {
      try {
        if (isMounted) {
          setState((prev) => ({ ...prev, loading: true, error: null }));
        }
        const client = getERPNextClient();
        const itemDoc = await client.getItem(productId);
        const product = mapERPItemToProduct(itemDoc);
        if (isMounted) {
          setState({ data: product, loading: false, error: null });
        }
      } catch (error) {
        if (isMounted) {
          setState({
            data: null,
            loading: false,
            error: error instanceof Error ? error : new Error('Unknown error'),
          });
        }
      }
    };

    fetchProduct();

    return () => {
      isMounted = false;
    };
  }, [productId, retryCount]);

  const retry = useCallback(() => {
    setRetryCount((prev) => prev + 1);
  }, []);

  return { ...state, retry, refetch: retry };
};

/**
 * Hook for fetching categories/item groups
 */
export const useCategories = () => {
  const [state, setState] = useState<UseAsyncState<Category[]>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        const client = getERPNextClient();
        const erpGroups = await client.getItemGroups();
        
        // Log raw API response to debug parent_item_group values
        console.log('📚 Raw API Response (first 3):');
        erpGroups.slice(0, 3).forEach((group: any) => {
          console.log(`  ${group.name}:`, {
            parent_item_group: group.parent_item_group,
            is_group: group.is_group,
            item_group_name: group.item_group_name
          });
        });
        
        // Filter out "All Items Group"
        const filteredGroups = erpGroups.filter((group: any) => 
          group.name !== 'All Items Group' && group.item_group_name !== 'All Items Group'
        );
        
        const categories = filteredGroups.map((group) =>
          mapERPItemGroupToCategory(group)
        );
        setState({ data: categories, loading: false, error: null });
      } catch (error) {
        setState({
          data: null,
          loading: false,
          error: error instanceof Error ? error : new Error('Unknown error'),
        });
      }
    };

    fetchCategories();
  }, []);

  return state;
};

/**
 * Hook for fetching pricing rule sample to see all available fields
 */
export const usePricingRuleFields = () => {
  const [state, setState] = useState<UseAsyncState<any>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const fetchFields = async () => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        const client = getERPNextClient();
        const fields = await client.getPricingRuleAllFields();
        setState({ data: fields, loading: false, error: null });
      } catch (error) {
        setState({
          data: null,
          loading: false,
          error: error instanceof Error ? error : new Error('Unknown error'),
        });
      }
    };

    fetchFields();
  }, []);

  return state;
};

/**
 * Hook for fetching pricing rules
 */
export const usePricingRules = () => {
  const [state, setState] = useState<UseAsyncState<any[]>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let isMounted = true;

    const fetchPricingRules = async () => {
      try {
        if (isMounted) {
          setState((prev) => ({ ...prev, loading: true, error: null }));
        }
        const client = getERPNextClient();
        const rules = await client.getPricingRules();
        if (isMounted) {
          setState({ data: rules, loading: false, error: null });
        }
      } catch (error) {
        if (isMounted) {
          setState({
            data: null,
            loading: false,
            error: error instanceof Error ? error : new Error('Unknown error'),
          });
        }
      }
    };

    fetchPricingRules();
    
    return () => {
      isMounted = false;
    };
  }, []);

  return state;
};

/**
 * Hook for fetching user orders with pagination support
 */
export const useOrders = (customerId: string, company?: string, pageSize: number = 20) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [initialLoad, setInitialLoad] = useState(true);

  useEffect(() => {
    const fetchInitialOrders = async () => {
      if (!customerId || customerId.trim() === '') {
        setOrders([]);
        setLoading(false);
        setHasMore(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const client = getERPNextClient();
        const erpOrders = await client.getSalesOrders(customerId, company, pageSize, 0);
        const mappedOrders = erpOrders.map((order) => mapERPSalesOrderToOrder(order));
        
        setOrders(mappedOrders);
        setOffset(mappedOrders.length);
        setHasMore(mappedOrders.length === pageSize);
        setInitialLoad(false);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setOrders([]);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialOrders();
  }, [customerId, company, pageSize]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || initialLoad || !customerId || customerId.trim() === '') {
      return;
    }

    setLoadingMore(true);
    setError(null);

    try {
      const client = getERPNextClient();
      const erpOrders = await client.getSalesOrders(customerId, company, pageSize, offset);
      const mappedOrders = erpOrders.map((order) => mapERPSalesOrderToOrder(order));
      
      setOrders((prev) => [...prev, ...mappedOrders]);
      setOffset((prev) => prev + mappedOrders.length);
      setHasMore(mappedOrders.length === pageSize);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, offset, pageSize, initialLoad, customerId, company]);

  const refresh = useCallback(() => {
    setOrders([]);
    setOffset(0);
    setHasMore(true);
    setInitialLoad(true);
    setError(null);
  }, []);

  return {
    data: orders,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
  };
};

/**
 * Hook for fetching user sales invoices
 */
export const useSalesInvoices = (userEmail: string) => {
  const [state, setState] = useState<UseAsyncState<SalesInvoice[]>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const fetchInvoices = async () => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        const client = getERPNextClient();
        // Fetch invoices filtered by custom_user field matching userEmail
        const erpInvoices = await client.getSalesInvoices(userEmail || '');
        console.log(`📄 Raw ERPNext invoices:`, erpInvoices.length, erpInvoices);
        const invoices = erpInvoices.map((invoice: any) => {
          const mapped = mapERPSalesInvoiceToSalesInvoice(invoice);
          console.log(`📄 Mapped invoice:`, {
            id: mapped.id,
            invoiceNumber: mapped.invoiceNumber,
            date: mapped.date,
            grandTotal: mapped.grandTotal,
            status: mapped.status,
            itemsCount: mapped.items?.length || 0,
          });
          return mapped;
        });
        console.log(`📄 Total mapped invoices:`, invoices.length);
        setState({ data: invoices, loading: false, error: null });
      } catch (error) {
        console.error('Error in useSalesInvoices:', error);
        setState({
          data: [],
          loading: false,
          error: error instanceof Error ? error : new Error('Unknown error'),
        });
      }
    };

    fetchInvoices();
  }, [userEmail]);

  return state;
};

/**
 * Hook for fetching a single sales invoice with items
 */
export const useSalesInvoice = (invoiceName: string) => {
  const [state, setState] = useState<UseAsyncState<SalesInvoice | null>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const fetchInvoice = async () => {
      if (!invoiceName) {
        setState({ data: null, loading: false, error: null });
        return;
      }

      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        const client = getERPNextClient();
        const erpInvoice = await client.getSalesInvoice(invoiceName);
        if (erpInvoice) {
          const invoice = mapERPSalesInvoiceToSalesInvoice(erpInvoice);
          setState({ data: invoice, loading: false, error: null });
        } else {
          setState({ data: null, loading: false, error: null });
        }
      } catch (error) {
        setState({
          data: null,
          loading: false,
          error: error instanceof Error ? error : new Error('Unknown error'),
        });
      }
    };

    fetchInvoice();
  }, [invoiceName]);

  return state;
};

/**
 * Hook for fetching a single order
 */
export const useOrder = (orderId: string) => {
  const [state, setState] = useState<UseAsyncState<Order>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        const client = getERPNextClient();
        const erpOrder = await client.getSalesOrder(orderId);
        const order = mapERPSalesOrderToOrder(erpOrder);
        setState({ data: order, loading: false, error: null });
      } catch (error) {
        setState({
          data: null,
          loading: false,
          error: error instanceof Error ? error : new Error('Unknown error'),
        });
      }
    };

    if (orderId) {
      fetchOrder();
    }
  }, [orderId]);

  return state;
};

/**
 * Hook for creating a new order
 */
export const useCreateOrder = () => {
  const [state, setState] = useState<UseAsyncState<Order>>({
    data: null,
    loading: false,
    error: null,
  });

  const createOrder = useCallback(
    async (orderData: {
      customer: string;
      company: string;
      items: Array<{
        item_code: string;
        qty: number;
        rate?: number;
        description?: string;
      }>;
    }) => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        const client = getERPNextClient();
        const erpOrder = await client.createSalesOrder(orderData);
        const order = mapERPSalesOrderToOrder(erpOrder);
        setState({ data: order, loading: false, error: null });
        return order;
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Unknown error');
        setState({ data: null, loading: false, error: err });
        throw err;
      }
    },
    []
  );

  return { ...state, createOrder };
};

/**
 * Hook for fetching user data
 */
export const useUser = (customerId: string) => {
  const [state, setState] = useState<UseAsyncState<User>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const fetchUser = async () => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        const client = getERPNextClient();
        const erpCustomer = await client.getCustomer(customerId);
        const user = mapERPCustomerToUser(erpCustomer);
        setState({ data: user, loading: false, error: null });
      } catch (error) {
        setState({
          data: null,
          loading: false,
          error: error instanceof Error ? error : new Error('Unknown error'),
        });
      }
    };

    if (customerId) {
      fetchUser();
    }
  }, [customerId]);

  return state;
};

/**
 * Hook for updating user data
 */
export const useUpdateUser = () => {
  const [state, setState] = useState<UseAsyncState<User>>({
    data: null,
    loading: false,
    error: null,
  });

  const updateUser = useCallback(
    async (customerId: string, userData: any) => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        const client = getERPNextClient();
        const erpCustomer = await client.updateCustomer(customerId, userData);
        const user = mapERPCustomerToUser(erpCustomer);
        setState({ data: user, loading: false, error: null });
        return user;
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Unknown error');
        setState({ data: null, loading: false, error: err });
        throw err;
      }
    },
    []
  );

  return { ...state, updateUser };
};

/**
 * Hook for testing ERPNext connection
 */
export const useERPNextConnection = () => {
  const [state, setState] = useState<UseAsyncState<boolean>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const testConnection = async () => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        const client = getERPNextClient();
        const connected = await client.testConnection();
        setState({ data: connected, loading: false, error: null });
      } catch (error) {
        setState({
          data: false,
          loading: false,
          error: error instanceof Error ? error : new Error('Unknown error'),
        });
      }
    };

    testConnection();
  }, []);

  return state;
};

/**
 * Hook for fetching "For You" products with infinite scroll
 * Loads random items from the system with pagination
 */
export const useForYouProducts = (pageSize: number = 20) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [initialLoad, setInitialLoad] = useState(true);

  // Load initial products
  useEffect(() => {
    const loadInitialProducts = async () => {
      if (!initialLoad) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const client = getERPNextClient();
        // Fetch first batch of products
        const websiteItems = await client.getWebsiteItems(undefined, pageSize, 0);
        const mappedProducts = websiteItems.map((item) => mapERPItemToProduct(item));
        
        // Randomize the order for "For You" section
        const shuffledProducts = shuffleArray(mappedProducts);
        
        setProducts(shuffledProducts);
        setOffset(pageSize);
        setHasMore(websiteItems.length === pageSize);
        setInitialLoad(false);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
      } finally {
        setLoading(false);
      }
    };

    loadInitialProducts();
  }, [initialLoad, pageSize]);

  // Load more products (for infinite scroll)
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || initialLoad) return;

    setLoadingMore(true);
    setError(null);

    try {
      const client = getERPNextClient();
      const websiteItems = await client.getWebsiteItems(undefined, pageSize, offset);
      const mappedProducts = websiteItems.map((item) => mapERPItemToProduct(item));
      
      // Randomize the new batch and append to existing products
      const shuffledProducts = shuffleArray(mappedProducts);
      
      setProducts((prev) => [...prev, ...shuffledProducts]);
      setOffset((prev) => prev + pageSize);
      setHasMore(websiteItems.length === pageSize);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, offset, pageSize, initialLoad]);

  // Refresh function to reload from start
  const refresh = useCallback(() => {
    setProducts([]);
    setOffset(0);
    setHasMore(true);
    setInitialLoad(true);
    setError(null);
  }, []);

  return {
    products,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
  };
};

/**
 * Hook for fetching deal products (products with pricing rules) with infinite scroll
 * Mixes products from different pricing rules randomly
 */
export const useDealProducts = (pageSize: number = 20, pricingRules: any[] | null = null) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [initialLoad, setInitialLoad] = useState(true);
  const [allDealProductsCache, setAllDealProductsCache] = useState<Product[]>([]);

  // Shuffle array function for randomizing items
  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // Fetch all deal products from pricing rules
  useEffect(() => {
    const fetchAllDealProducts = async () => {
      if (!pricingRules || pricingRules.length === 0) {
        setAllDealProductsCache([]);
        return;
      }

      try {
        const client = getERPNextClient();
        const allProducts: Product[] = [];

        // Extract item codes and item groups from pricing rules
        for (const rule of pricingRules) {
          const ruleAny = rule as any;
          const ruleName = rule.name || ruleAny.name || 'Unknown';
          
          // Fetch products by item codes
          if (ruleAny.items && Array.isArray(ruleAny.items)) {
            for (const item of ruleAny.items) {
              if (item && item.item_code) {
                try {
                  const websiteItem = await client.getItem(item.item_code);
                  if (websiteItem) {
                    const product = mapERPItemToProduct(websiteItem);
                    const calculatedDiscount = getProductDiscount(product, pricingRules);
                    const ruleDiscount = ruleAny.discount_percentage || 0;
                    const discount = calculatedDiscount > 0 ? calculatedDiscount : ruleDiscount;
                    
                    if (discount > 0 || ruleDiscount > 0) {
                      const productWithDiscount = {
                        ...product,
                        discount: discount > 0 ? discount : ruleDiscount,
                        ruleName
                      };
                      allProducts.push(productWithDiscount);
                    }
                  }
                } catch (error: any) {
                  if (error?.message && !error.message.includes('not found') && !error.message.includes('DoesNotExistError')) {
                    console.warn(`Failed to fetch product ${item.item_code}:`, error.message);
                  }
                }
              }
            }
          }

          // Fetch products by item groups
          if (ruleAny.item_groups && Array.isArray(ruleAny.item_groups)) {
            for (const itemGroup of ruleAny.item_groups) {
              if (itemGroup && itemGroup.item_group) {
                try {
                  const websiteItems = await client.getItemsByGroup(itemGroup.item_group, 100);
                  const groupProducts = websiteItems.map((item: any) => {
                    const product = mapERPItemToProduct(item);
                    const discount = getProductDiscount(product, pricingRules);
                    return {
                      ...product,
                      discount,
                      ruleName
                    };
                  }).filter((p: any) => p.discount > 0);
                  allProducts.push(...groupProducts);
                } catch (error) {
                  console.warn(`Failed to fetch products for group ${itemGroup.item_group}:`, error);
                }
              }
            }
          }
        }

        // Remove duplicates and shuffle to mix products from different rules
        const uniqueProducts = Array.from(
          new Map(allProducts.map((p: any) => [p.id, p])).values()
        );
        const shuffledProducts = shuffleArray(uniqueProducts);
        
        setAllDealProductsCache(shuffledProducts);
      } catch (error) {
        console.error('Error fetching deal products:', error);
        setAllDealProductsCache([]);
      }
    };

    fetchAllDealProducts();
  }, [pricingRules]);

  // Load initial products from cache
  useEffect(() => {
    if (initialLoad && allDealProductsCache.length > 0) {
      const initialProducts = allDealProductsCache.slice(0, pageSize);
      setProducts(initialProducts);
      setOffset(pageSize);
      setHasMore(allDealProductsCache.length > pageSize);
      setInitialLoad(false);
      setLoading(false);
    } else if (initialLoad && allDealProductsCache.length === 0 && pricingRules && pricingRules.length > 0) {
      setLoading(true);
    } else if (initialLoad && (!pricingRules || pricingRules.length === 0)) {
      setProducts([]);
      setHasMore(false);
      setInitialLoad(false);
      setLoading(false);
    }
  }, [initialLoad, allDealProductsCache, pageSize, pricingRules]);

  // Load more products (for infinite scroll)
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || initialLoad) return;

    setLoadingMore(true);
    setError(null);

    try {
      const nextProducts = allDealProductsCache.slice(offset, offset + pageSize);
      
      setProducts((prev) => [...prev, ...nextProducts]);
      setOffset((prev) => prev + pageSize);
      setHasMore(offset + pageSize < allDealProductsCache.length);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, offset, pageSize, initialLoad, allDealProductsCache]);

  // Refresh function to reload from start
  const refresh = useCallback(() => {
    setProducts([]);
    setOffset(0);
    setHasMore(true);
    setInitialLoad(true);
    setError(null);
    setAllDealProductsCache([]);
  }, []);

  return {
    products,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
  };
};

/**
 * Hook for fetching reviews for a specific product (Website Item)
 */
export const useProductReviews = (websiteItemName: string | null) => {
  const [state, setState] = useState<UseAsyncState<ProductReview[]>>({
    data: null,
    loading: false,
    error: null,
  });
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!websiteItemName) {
      setState({ data: [], loading: false, error: null });
      return;
    }

    let isMounted = true;

    const fetchReviews = async () => {
      try {
        if (isMounted) {
          setState((prev) => ({ ...prev, loading: true, error: null }));
        }
        const client = getERPNextClient();
        const erpReviews = await client.getItemReviews(websiteItemName);
        const reviews = erpReviews.map((review: any) => 
          mapERPItemReviewToProductReview(review, websiteItemName)
        );
        
        if (isMounted) {
          setState({ data: reviews, loading: false, error: null });
        }
      } catch (error) {
        if (isMounted) {
          setState({
            data: null,
            loading: false,
            error: error instanceof Error ? error : new Error('Unknown error'),
          });
        }
      }
    };

    fetchReviews();

    return () => {
      isMounted = false;
    };
  }, [websiteItemName, refreshKey]);

  const refresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  return { ...state, refresh };
};

// Stable empty array reference for wishlist
const EMPTY_WISHLIST: WishlistItem[] = [];

/**
 * Hook for fetching user wishlist
 */
export const useWishlist = (userEmail: string | null) => {
  const [state, setState] = useState<UseAsyncState<WishlistItem[]>>({
    data: null,
    loading: true,
    error: null,
  });
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const fetchWishlist = async () => {
      if (!userEmail) {
        if (isMounted) {
          setState({ data: EMPTY_WISHLIST, loading: false, error: null });
        }
        return;
      }

      try {
        if (isMounted) {
          setState((prev) => ({ ...prev, loading: true, error: null }));
        }
        const client = getERPNextClient();
        const erpWishlist = await client.getWishlist(userEmail);
        
        if (!erpWishlist || !erpWishlist.items || erpWishlist.items.length === 0) {
          if (isMounted) {
            setState({ data: EMPTY_WISHLIST, loading: false, error: null });
          }
          return;
        }

        // Map ERPNext wishlist to app WishlistItem array
        const wishlistItems = await mapERPWishlistToWishlistItems(erpWishlist, client);
        
        if (isMounted) {
          setState({ data: wishlistItems, loading: false, error: null });
        }
      } catch (error) {
        console.error('Error fetching wishlist:', error);
        if (isMounted) {
          setState({
            data: null,
            loading: false,
            error: error instanceof Error ? error : new Error('Failed to fetch wishlist'),
          });
        }
      }
    };

    fetchWishlist();
    return () => {
      isMounted = false;
    };
  }, [userEmail, refreshKey]);

  const refresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  // Memoize wishlistItems to prevent creating new array references on every render
  // Compare by content, not reference, to avoid unnecessary re-renders
  const wishlistItemsRef = useRef<WishlistItem[]>(EMPTY_WISHLIST);
  const wishlistIdsStringRef = useRef<string>('');
  
  const wishlistItems = useMemo(() => {
    if (!state.data || state.data.length === 0) {
      return EMPTY_WISHLIST;
    }
    
    // Create a stable string representation to compare content
    const currentIdsString = JSON.stringify([...new Set(state.data.map(item => item.productId))].sort());
    
    // Only return new array if content actually changed
    if (currentIdsString === wishlistIdsStringRef.current) {
      return wishlistItemsRef.current;
    }
    
    // Update refs and return new array
    wishlistIdsStringRef.current = currentIdsString;
    wishlistItemsRef.current = state.data;
    return state.data;
  }, [state.data]);

  return {
    wishlistItems,
    loading: state.loading,
    error: state.error,
    refresh,
  };
};

/**
 * Hook for managing wishlist operations (add/remove)
 * Accepts an optional refresh callback to update wishlist state immediately
 */
export const useWishlistActions = (onSuccess?: () => void) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { user } = useUserSession();

  const addToWishlist = useCallback(async (itemCode: string) => {
    if (!user?.email) {
      setError(new Error('Please log in to add items to wishlist'));
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const client = getERPNextClient();
      await client.addToWishlist(user.email, itemCode, 1);
      
      // Call refresh callback after a short delay to ensure server has processed
      // This makes the update more reliable and flexible
      if (onSuccess) {
        // Use setTimeout to allow the API call to complete fully
        setTimeout(() => {
          onSuccess();
        }, 100);
      }
      
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add to wishlist';
      setError(new Error(errorMessage));
      console.error('Error adding to wishlist:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user?.email, onSuccess]);

  const removeFromWishlist = useCallback(async (itemCode: string) => {
    if (!user?.email) {
      setError(new Error('Please log in to remove items from wishlist'));
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const client = getERPNextClient();
      await client.removeFromWishlist(user.email, itemCode);
      
      // Call refresh callback after a short delay to ensure server has processed
      // This makes the update more reliable and flexible
      if (onSuccess) {
        // Use setTimeout to allow the API call to complete fully
        setTimeout(() => {
          onSuccess();
        }, 100);
      }
      
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to remove from wishlist';
      setError(new Error(errorMessage));
      console.error('Error removing from wishlist:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user?.email, onSuccess]);

  const toggleWishlist = useCallback(async (itemCode: string, isCurrentlyWishlisted: boolean) => {
    if (isCurrentlyWishlisted) {
      return await removeFromWishlist(itemCode);
    } else {
      return await addToWishlist(itemCode);
    }
  }, [addToWishlist, removeFromWishlist]);

  return {
    addToWishlist,
    removeFromWishlist,
    toggleWishlist,
    isLoading,
    error,
  };
};

/**
 * Hook to check if a product is in the wishlist
 */
export const useIsWishlisted = (productId: string | null) => {
  const { user } = useUserSession();
  const { wishlistItems } = useWishlist(user?.email || null);
  const [isWishlisted, setIsWishlisted] = useState(false);

  useEffect(() => {
    if (!productId || !wishlistItems) {
      setIsWishlisted(false);
      return;
    }

    // Check if product is in wishlist by comparing productId with wishlist item's productId
    const found = wishlistItems.some(item => item.productId === productId);
    setIsWishlisted(found);
  }, [productId, wishlistItems]);

  return isWishlisted;
};

/**
 * Hook to fetch and manage shopping cart
 */
export const useShoppingCart = (userEmail: string | null) => {
  const [cartItems, setCartItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!userEmail) {
      setCartItems([]);
      setLoading(false);
      return;
    }

    let isMounted = true;

    const fetchCart = async () => {
      try {
        setLoading(true);
        setError(null);
        const client = getERPNextClient();
        const cart = await client.getShoppingCart(userEmail);
        
        if (isMounted) {
          if (cart && cart.items) {
            // Map cart items to include product details
            const itemsWithProducts = await Promise.all(
              cart.items.map(async (item: any) => {
                try {
                  // Fetch product details using item_code
                  const product = await client.getItem(item.item_code || item.item);
                  return {
                    id: item.name || `${item.item_code}-${Date.now()}`,
                    itemCode: item.item_code || item.item,
                    quantity: item.quantity || 1,
                    description: item.description || '', // Include description from cart item
                    product: product ? mapERPItemToProduct(product) : null,
                  };
                } catch (err) {
                  console.error(`Error fetching product for ${item.item_code}:`, err);
                  return {
                    id: item.name || `${item.item_code}-${Date.now()}`,
                    itemCode: item.item_code || item.item,
                    quantity: item.quantity || 1,
                    product: null,
                  };
                }
              })
            );
            setCartItems(itemsWithProducts);
          } else {
            setCartItems([]);
          }
        }
      } catch (err) {
        if (isMounted) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to fetch cart';
          setError(new Error(errorMessage));
          console.error('Error fetching cart:', err);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchCart();

    return () => {
      isMounted = false;
    };
  }, [userEmail, refreshKey]);

  const refresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  return {
    cartItems,
    loading,
    error,
    refresh,
  };
};

/**
 * Hook for cart actions (add, remove, update quantity)
 */
export const useCartActions = (onSuccess?: () => void) => {
  const { user } = useUserSession();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const addToCart = useCallback(async (itemCode: string, quantity: number = 1, description?: string) => {
    if (!user?.email) {
      setError(new Error('Please log in to add items to cart'));
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const client = getERPNextClient();
      await client.addToCart(user.email, itemCode, quantity, description);
      
      if (onSuccess) {
        setTimeout(() => {
          onSuccess();
        }, 100);
      }
      
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add to cart';
      setError(new Error(errorMessage));
      console.error('Error adding to cart:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user?.email, onSuccess]);

  const removeFromCart = useCallback(async (itemCode: string) => {
    if (!user?.email) {
      setError(new Error('Please log in to remove items from cart'));
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const client = getERPNextClient();
      await client.removeFromCart(user.email, itemCode);
      
      if (onSuccess) {
        setTimeout(() => {
          onSuccess();
        }, 100);
      }
      
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to remove from cart';
      setError(new Error(errorMessage));
      console.error('Error removing from cart:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user?.email, onSuccess]);

  const updateQuantity = useCallback(async (itemCode: string, quantity: number) => {
    if (!user?.email) {
      setError(new Error('Please log in to update cart'));
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const client = getERPNextClient();
      await client.updateCartItemQuantity(user.email, itemCode, quantity);
      
      if (onSuccess) {
        setTimeout(() => {
          onSuccess();
        }, 100);
      }
      
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update cart';
      setError(new Error(errorMessage));
      console.error('Error updating cart:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user?.email, onSuccess]);

  const clearCart = useCallback(async () => {
    if (!user?.email) {
      setError(new Error('Please log in to clear cart'));
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const client = getERPNextClient();
      await client.clearCart(user.email);
      
      if (onSuccess) {
        setTimeout(() => {
          onSuccess();
        }, 100);
      }
      
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to clear cart';
      setError(new Error(errorMessage));
      console.error('Error clearing cart:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user?.email, onSuccess]);

  return {
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    isLoading,
    error,
  };
};

/**
 * Hook for fetching top customers of the month
 */
export const useTopCustomers = (year?: number, month?: number) => {
  return {
    data: null,
    loading: false,
    error: null,
  };
};

export interface Flyer {
  name: string;
  flyer_name: string;
  image: string | null;
  description?: string;
}

/**
 * Hook for fetching Flyers
 */
export const useFlyers = () => {
  const [state, setState] = useState<UseAsyncState<Flyer[]>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const fetchFlyers = async () => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        const client = getERPNextClient();
        const flyers = await client.getFlyers();
        setState({ data: flyers, loading: false, error: null });
      } catch (error) {
        setState({
          data: null,
          loading: false,
          error: error instanceof Error ? error : new Error('Failed to fetch flyers'),
        });
      }
    };

    fetchFlyers();
  }, []);

  return state;
};

/**
 * Hook for fetching Product Bundles
 */
export const useProductBundles = (limit: number = 10) => {
  const [state, setState] = useState<UseAsyncState<Array<{
    bundleName: string;
    newItemCode: string;
    customCustomer?: string;
    items: Array<{
      itemCode: string;
      itemName?: string;
      image?: string | null;
    }>;
  }>>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let isMounted = true;

    const fetchBundles = async () => {
      if (isMounted) {
        setState(prev => ({ ...prev, loading: true, error: null }));
      }
      try {
        const client = getERPNextClient();
        const bundles = await client.getProductBundles(limit);
        // Randomize product bundles
        const shuffledBundles = shuffleArray(bundles);
        if (isMounted) {
          setState({ data: shuffledBundles, loading: false, error: null });
        }
      } catch (err) {
        if (isMounted) {
          setState({
            data: null,
            loading: false,
            error: err instanceof Error ? err : new Error('Failed to fetch product bundles'),
          });
        }
      }
    };

    fetchBundles();
    
    return () => {
      isMounted = false;
    };
  }, [limit]);

  return state;
};
