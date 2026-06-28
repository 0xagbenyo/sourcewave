/**
 * Data Mappers
 * 
 * Transform ERPNext API responses to application types
 */

import { encodeErpFileUrl } from '../utils/erpImageUrl';
import { readErpDocLineImage } from '../utils/erpDocLineImageField';

import {
  User,
  Product,
  ProductColor,
  ProductSize,
  Order,
  OrderItem,
  UserAddress,
  Category,
  Cart,
  CartItem,
  WishlistItem,
  ProductReview,
  SalesInvoice,
  SalesInvoiceItem,
} from '../types';

/**
 * Strip HTML tags and decode HTML entities from text
 */
const stripHtmlTags = (html: string): string => {
  if (!html) return '';
  // Remove HTML tags and decode HTML entities
  return html
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
    .replace(/&amp;/g, '&') // Replace &amp; with &
    .replace(/&lt;/g, '<') // Replace &lt; with <
    .replace(/&gt;/g, '>') // Replace &gt; with >
    .replace(/&quot;/g, '"') // Replace &quot; with "
    .replace(/&#39;/g, "'") // Replace &#39; with '
    .replace(/&apos;/g, "'") // Replace &apos; with '
    .replace(/&mdash;/g, '—') // Replace &mdash; with —
    .replace(/&ndash;/g, '–') // Replace &ndash; with –
    .replace(/&hellip;/g, '...') // Replace &hellip; with ...
    .trim();
};

/**
 * Map ERPNext Customer to User type
 */
export const mapERPCustomerToUser = (erpCustomer: any): User => {
  return {
    id: erpCustomer.name,
    email: erpCustomer.email_id || erpCustomer.email || '',
    firstName: erpCustomer.customer_name?.split(' ')[0] || '',
    lastName: erpCustomer.customer_name?.split(' ').slice(1).join(' ') || '',
    phone: erpCustomer.phone_1 || '',
    avatar: erpCustomer.image || undefined,
    loyaltyPoints: erpCustomer.custom_loyalty_points || 0,
    createdAt: erpCustomer.creation || new Date().toISOString(),
    updatedAt: erpCustomer.modified || new Date().toISOString(),
  };
};

/**
 * Map User type to ERPNext Customer data
 */
export const mapUserToERPCustomer = (user: User) => {
  return {
    customer_name: `${user.firstName} ${user.lastName}`.trim(),
    email_id: user.email,
    phone_1: user.phone || '',
    mobile_no: user.phone || '',
    customer_type: 'Individual',
    image: user.avatar,
    custom_loyalty_points: user.loyaltyPoints,
  };
};

/**
 * Map ERPNext Website Item to Product type (Primary mapping for marketplace)
 */
export const mapERPWebsiteItemToProduct = (websiteItem: any): Product => {
  // Price should be fetched from Item Price doctype (now included in getWebsiteItem)
  // Use price_list_rate if available, otherwise fallback to 0
  const basePrice = websiteItem.price_list_rate || websiteItem.standard_rate || 0;
  const originalPrice = websiteItem.list_price || websiteItem.standard_rate || basePrice;
  const discount = originalPrice > basePrice ? originalPrice - basePrice : 0;
  const discountPercentage = originalPrice > 0 
    ? Math.round((discount / originalPrice) * 100)
    : 0;

  // Handle image URL for listings - ALWAYS use website_image from Website Item
  // This is the default/display image for product listings
  let imageUrl = websiteItem.website_image || websiteItem.thumbnail || '';
  // Encode path segments (spaces, parentheses in filenames) for RN Image — works for full URLs too
  if (imageUrl) {
    imageUrl = encodeErpFileUrl(imageUrl);
  }

  // Build images array for listings - ONLY use website_image (the default image from Website Item)
  const images: string[] = [];
  if (imageUrl) {
    images.push(imageUrl);
  }
  // Note: We don't add thumbnail separately to avoid confusion - listings should show website_image only

  // Extract slideshow images for detail page
  // slideshow can be:
  // 1. A Link field pointing to a separate Website Slideshow doctype (with child table)
  // 2. A child table directly in Website Item
  // 3. An array of image objects
  const slideshowImages: string[] = [];
  
  // First, check if slideshow_data was fetched (from linked Website Slideshow document)
  if (websiteItem.slideshow_data) {
    const slideshowDoc = websiteItem.slideshow_data;
    
    // Debug: log the slideshow document structure
    console.log('Slideshow document keys:', Object.keys(slideshowDoc));
    
    // Child table names in ERPNext - try various naming conventions
    // For Website Slideshow, common names might be:
    const childTableNames = [
      'website_slideshow_item',  // Most likely for Website Slideshow
      'website_slideshow_items',
      'slideshow_items',
      'slideshow_item', 
      'slideshow_slides',
      'slides',
      'items',
      'item',
      'image_slides',
      'image_slide'
    ];
    
    // Find the child table
    let childTable: any[] = [];
    for (const tableName of childTableNames) {
      if (slideshowDoc[tableName] && Array.isArray(slideshowDoc[tableName])) {
        childTable = slideshowDoc[tableName];
        console.log(`Found child table: ${tableName} with ${childTable.length} items`);
        break;
      }
    }
    
    // If no standard name found, look for any array property that might be the child table
    if (childTable.length === 0) {
      console.log('Searching for child table in slideshow document...');
      for (const key in slideshowDoc) {
        if (Array.isArray(slideshowDoc[key]) && slideshowDoc[key].length > 0) {
          // Check if it looks like a child table (has objects with image field)
          const firstItem = slideshowDoc[key][0];
          console.log(`Checking array key: ${key}, first item:`, firstItem);
          if (firstItem && typeof firstItem === 'object' && (firstItem.image || firstItem.image_name || firstItem.Image || firstItem.Image_Name)) {
            childTable = slideshowDoc[key];
            console.log(`Found child table by inspection: ${key} with ${childTable.length} items`);
            break;
          }
        }
      }
    }
    
    // Extract images from child table rows
    if (childTable.length > 0) {
      console.log(`Extracting images from ${childTable.length} slideshow items`);
      childTable.forEach((row: any, index: number) => {
        if (!row) return;
        
        console.log(`Slide ${index}:`, row);
        
        // Check for Image field (case-insensitive, try multiple variations)
        let imagePath = null;
        if (row.image) {
          imagePath = row.image;
        } else if (row.Image) {
          imagePath = row.Image;
        } else if (row.image_name) {
          imagePath = row.image_name;
        } else if (row.Image_Name) {
          imagePath = row.Image_Name;
        } else if (row.image_url) {
          imagePath = row.image_url;
        } else if (row.Image_URL) {
          imagePath = row.Image_URL;
        }
        
        if (imagePath) {
          const slideUrl = encodeErpFileUrl(imagePath);
          if (slideUrl && !slideshowImages.includes(slideUrl)) {
            slideshowImages.push(slideUrl);
            console.log(`Added slideshow image ${index + 1}:`, slideUrl);
          }
        } else {
          console.warn(`No image found in slide ${index}:`, row);
        }
      });
    } else {
      console.warn('No child table found in slideshow document');
    }
  } else if (websiteItem.slideshow) {
    console.log('Website Item has slideshow field but no slideshow_data:', websiteItem.slideshow);
  }
  
  // Second, check if slideshow is a child table directly in Website Item
  if (slideshowImages.length === 0) {
    const childTableNames = [
      'slideshow_items',
      'slideshow_item',
      'slideshow',
      'items',
      'item'
    ];
    
    for (const tableName of childTableNames) {
      if (websiteItem[tableName] && Array.isArray(websiteItem[tableName])) {
        const childTable = websiteItem[tableName];
        childTable.forEach((row: any) => {
          if (!row) return;
          
          let imagePath = null;
          if (row.image) {
            imagePath = row.image;
          } else if (row.Image) {
            imagePath = row.Image;
          } else if (row.image_name) {
            imagePath = row.image_name;
          } else if (row.Image_Name) {
            imagePath = row.Image_Name;
          }
          
          if (imagePath) {
            const slideUrl = encodeErpFileUrl(imagePath);
            if (slideUrl && !slideshowImages.includes(slideUrl)) {
              slideshowImages.push(slideUrl);
            }
          }
        });
        
        if (slideshowImages.length > 0) break;
      }
    }
  }
  
  // Third, fallback: if slideshow is a direct array (legacy support)
  if (slideshowImages.length === 0 && websiteItem.slideshow && Array.isArray(websiteItem.slideshow)) {
    websiteItem.slideshow.forEach((slide: any) => {
      if (!slide) return;
      let imagePath = null;
      if (typeof slide === 'string') {
        imagePath = slide;
      } else if (slide.image || slide.Image) {
        imagePath = slide.image || slide.Image;
      }
      if (imagePath) {
        const slideUrl = encodeErpFileUrl(imagePath);
        if (slideUrl && !slideshowImages.includes(slideUrl)) {
          slideshowImages.push(slideUrl);
        }
      }
    });
  }

  // Use short_description for listings, web_long_description for detail pages
  // Strip HTML tags from description
  const rawDescription = websiteItem.web_long_description || websiteItem.short_description || websiteItem.description || '';
  const description = stripHtmlTags(rawDescription);

  // Extract Website Specifications (Label, Description table)
  // The website_specifications is a child table with Label and Description fields
  const specifications: Array<{ label: string; description: string }> = [];
  if (websiteItem.website_specifications && Array.isArray(websiteItem.website_specifications)) {
    console.log(`[Mapper] Found ${websiteItem.website_specifications.length} specifications`);
    websiteItem.website_specifications.forEach((spec: any, index: number) => {
      console.log(`[Mapper] Spec ${index}:`, spec);
      
      // Skip color and size specs as they're handled separately
      const specName = (spec.name || spec.label || spec.Label || '').toLowerCase();
      if (specName !== 'color' && specName !== 'size') {
        // Try different field name variations (Label, label, Description, description)
        const rawLabel = spec.Label || spec.label || spec.name || '';
        const rawDescription = spec.Description || spec.description || spec.value || '';
        
        // Strip HTML tags from label and description
        const label = stripHtmlTags(rawLabel);
        const description = stripHtmlTags(rawDescription);
        
        if (label || description) {
          specifications.push({
            label: label,
            description: description,
          });
          console.log(`[Mapper] Added specification: ${label} = ${description}`);
        }
      }
    });
  } else {
    console.log(`[Mapper] No website_specifications found or not an array:`, websiteItem.website_specifications);
  }

  // Debug logging
  console.log(`[Mapper] Product: ${websiteItem.name || websiteItem.web_item_name}`);
  console.log(`[Mapper] website_image: ${websiteItem.website_image}`);
  console.log(`[Mapper] images array (for listings):`, images);
  console.log(`[Mapper] slideshowImages array (for detail):`, slideshowImages);
  console.log(`[Mapper] Has slideshow link: ${websiteItem.slideshow || 'none'}`);
  console.log(`[Mapper] Specifications count: ${specifications.length}`);

  return {
    id: websiteItem.name,
    name: websiteItem.web_item_name || websiteItem.item_name || websiteItem.name,
    description: description,
    price: basePrice,
    originalPrice: originalPrice > basePrice ? originalPrice : undefined,
    discountPercentage: discountPercentage > 0 ? discountPercentage : undefined,
    category: websiteItem.item_group || 'Uncategorized',
    subcategory: '',
    brand: websiteItem.brand || 'Unknown',
    company: websiteItem.custom_company || undefined,
    images: images, // For listings - ALWAYS use website_image from Website Item
    slideshowImages: slideshowImages.length > 0 ? slideshowImages : undefined, // For detail page - use slideshow if available, otherwise undefined (will fallback to images)
    colors: extractColorsFromWebsiteItem(websiteItem),
    sizes: extractSizesFromWebsiteItem(websiteItem),
    specifications: specifications.length > 0 ? specifications : undefined,
    // Use available_stock if fetched, otherwise fallback to published status
    inStock: websiteItem.available_stock !== undefined 
      ? websiteItem.available_stock > 0 
      : (websiteItem.published === 1 && !websiteItem.on_backorder),
    rating: websiteItem.custom_rating || 0,
    reviewCount: websiteItem.custom_review_count || 0,
    tags: (websiteItem.tags || '').split(',').filter((t: string) => t.trim()),
    isNew: isNewProduct(websiteItem),
    isTrending: websiteItem.ranking && websiteItem.ranking > 0, // High ranking = trending
    isOnSale: discountPercentage > 0 || (websiteItem.offers && websiteItem.offers.length > 0),
    createdAt: websiteItem.creation || new Date().toISOString(),
    updatedAt: websiteItem.modified || new Date().toISOString(),
    itemCode: websiteItem.item_code || websiteItem.item || undefined, // Item doctype code for cart operations
  };
};

/**
 * Extract colors from Website Item specifications
 */
const extractColorsFromWebsiteItem = (websiteItem: any): ProductColor[] => {
  // Check for specifications table with color values
  if (websiteItem.website_specifications && Array.isArray(websiteItem.website_specifications)) {
    const colorSpecs = websiteItem.website_specifications
      .filter((spec: any) => spec.name && spec.name.toLowerCase() === 'color')
      .map((spec: any) => ({
        id: spec.value || spec.label || '1',
        name: spec.value || spec.label || 'Default',
        hexCode: '#000000',
        inStock: true,
      }));
    
    if (colorSpecs.length > 0) return colorSpecs;
  }

  // Default color
  return [
    {
      id: '1',
      name: 'Default',
      hexCode: '#000000',
      inStock: true,
    },
  ];
};

/**
 * Extract sizes from Website Item specifications
 */
const extractSizesFromWebsiteItem = (websiteItem: any): ProductSize[] => {
  // First, check for custom_size child table (priority)
  if (websiteItem.custom_size && Array.isArray(websiteItem.custom_size)) {
    const customSizes = websiteItem.custom_size
      .filter((row: any) => row.size) // Filter out rows without size value
      .map((row: any, index: number) => ({
        id: row.name || row.idx?.toString() || (index + 1).toString(),
        name: row.size || row.size_name || 'M',
        inStock: row.in_stock !== undefined ? row.in_stock !== 0 : true, // Check in_stock field if available
      }));
    
    if (customSizes.length > 0) {
      console.log(`[Mapper] Found ${customSizes.length} sizes from custom_size child table`);
      return customSizes;
    }
  }

  // Fallback: Check for specifications table with size values
  if (websiteItem.website_specifications && Array.isArray(websiteItem.website_specifications)) {
    const sizeSpecs = websiteItem.website_specifications
      .filter((spec: any) => spec.name && spec.name.toLowerCase() === 'size')
      .map((spec: any) => ({
        id: spec.value || spec.label || '1',
        name: spec.value || spec.label || 'M',
        inStock: true,
      }));
    
    if (sizeSpecs.length > 0) {
      console.log(`[Mapper] Found ${sizeSpecs.length} sizes from website_specifications`);
      return sizeSpecs;
    }
  }

  // No sizes found - return empty array (no dummy/default sizes)
  console.log(`[Mapper] No sizes found, returning empty array`);
  return [];
};

/**
 * Map ERPNext Item to Product type (Legacy - for backward compatibility)
 */
export const mapERPItemToProduct = (erpItem: any, supplier?: string): Product => {
  const basePrice =
    (erpItem.price_list_rate != null && erpItem.price_list_rate > 0
      ? erpItem.price_list_rate
      : null) ??
    erpItem.standard_rate ??
    0;
  const originalPrice = basePrice;
  const discount = originalPrice > basePrice ? originalPrice - basePrice : 0;
  const discountPercentage = originalPrice > 0 
    ? Math.round((discount / originalPrice) * 100)
    : 0;

  // Handle image URL — encode segments so paths like /files/download (1).jpg load in RN Image
  const imageUrl = erpItem.image ? encodeErpFileUrl(erpItem.image) : '';

  return {
    id: erpItem.name,
    name: erpItem.item_name || erpItem.name,
    description: erpItem.description || '',
    price: basePrice,
    originalPrice: originalPrice > basePrice ? originalPrice : undefined,
    discountPercentage: discountPercentage > 0 ? discountPercentage : undefined,
    category: erpItem.item_group || 'Uncategorized',
    subcategory: erpItem.sub_group || '',
    brand: erpItem.brand || 'Unknown',
    company: erpItem.custom_company || undefined,
    images: imageUrl ? [imageUrl] : [],
    slideshowImages: imageUrl ? [imageUrl] : [],
    colors: extractColorsFromItem(erpItem),
    sizes: extractSizesFromItem(erpItem),
    inStock: erpItem.disabled === 0,
    rating: erpItem.custom_rating || 0,
    reviewCount: erpItem.custom_review_count || 0,
    tags: (erpItem.tags || '').split(',').filter((t: string) => t.trim()),
    isNew: isNewProduct(erpItem),
    isTrending: erpItem.custom_is_trending === 1,
    isOnSale: discountPercentage > 0,
    createdAt: erpItem.creation || new Date().toISOString(),
    updatedAt: erpItem.modified || new Date().toISOString(),
  };
};

/**
 * Extract colors from ERPNext Item variants or custom field
 */
const extractColorsFromItem = (erpItem: any): ProductColor[] => {
  // Check for custom colors field
  if (erpItem.custom_colors) {
    try {
      const colors = JSON.parse(erpItem.custom_colors);
      return colors.map((c: any) => ({
        id: c.id || c.color,
        name: c.color || c.name || '',
        hexCode: c.hex_code || '#000000',
        inStock: c.in_stock !== false,
      }));
    } catch (e) {
      // Fallback
    }
  }

  // Default color
  return [
    {
      id: '1',
      name: 'Default',
      hexCode: '#000000',
      inStock: true,
    },
  ];
};

/**
 * Extract sizes from ERPNext Item attributes or custom field
 */
const extractSizesFromItem = (erpItem: any): ProductSize[] => {
  // Check for custom sizes field
  if (erpItem.custom_sizes) {
    try {
      const sizes = JSON.parse(erpItem.custom_sizes);
      return sizes.map((s: any) => ({
        id: s.id || s.size,
        name: s.size || s.name || '',
        inStock: s.in_stock !== false,
      }));
    } catch (e) {
      // Fallback
    }
  }

  // Default sizes (common for fashion)
  return [
    { id: '1', name: 'XS', inStock: true },
    { id: '2', name: 'S', inStock: true },
    { id: '3', name: 'M', inStock: true },
    { id: '4', name: 'L', inStock: true },
    { id: '5', name: 'XL', inStock: true },
    { id: '6', name: 'XXL', inStock: true },
  ];
};

/**
 * Check if product is new (created within last 7 days)
 */
const isNewProduct = (erpItem: any): boolean => {
  if (!erpItem.creation) return false;
  const createdDate = new Date(erpItem.creation);
  const now = new Date();
  const daysDiff = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24);
  return daysDiff <= 7;
};

/**
 * Map ERPNext Sales Order to Order type
 */
function mapFormattedErpAddressText(text: string, addressName?: string): UserAddress | undefined {
  const cleaned = String(text || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim();
  if (!cleaned) return undefined;

  const lines = cleaned
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return undefined;

  let phone = '';
  const bodyLines: string[] = [];
  for (const line of lines) {
    const phoneMatch = line.match(/^phone:\s*(.+)$/i);
    if (phoneMatch) {
      phone = phoneMatch[1].trim();
    } else {
      bodyLines.push(line);
    }
  }

  const [line1 = '', ...rest] = bodyLines;
  const cityState = rest.length ? rest[rest.length - 1] : '';
  const [city = '', state = ''] = cityState.split(',').map((part) => part.trim());

  return {
    id: addressName || '',
    userId: '',
    type: 'home',
    firstName: '',
    lastName: '',
    addressLine1: line1,
    city,
    state,
    postalCode: '',
    country: rest.length > 1 ? rest.slice(0, -1).join(', ') : '',
    phone,
    isDefault: false,
  };
}

export const mapERPSalesOrderToOrder = (erpOrder: any): Order => {
  const shippingAddr =
    mapERPAddressToUserAddress(erpOrder.shipping_address_doc) ||
    mapFormattedErpAddressText(erpOrder.shipping_address, erpOrder.shipping_address_name);
  const billingAddr =
    mapERPAddressToUserAddress(erpOrder.billing_address_doc) ||
    mapFormattedErpAddressText(erpOrder.billing_address, erpOrder.billing_address_name);

  // Create default address if not found
  const defaultAddress: UserAddress = {
    id: erpOrder.name,
    userId: erpOrder.customer,
    type: 'home',
    firstName: '',
    lastName: '',
    addressLine1: '',
    city: '',
    state: '',
    postalCode: '',
    country: '',
    phone: '',
    isDefault: true,
  };

  const status = mapERPOrderStatusFromDocstatus(erpOrder.docstatus, erpOrder.status);

  return {
    id: erpOrder.name,
    userId: erpOrder.custom_customer_id || '',
    orderNumber: erpOrder.name,
    status: status,
    items: (erpOrder.items || []).map((item: any) => 
      mapERPSalesOrderItemToOrderItem(item)
    ),
    subtotal: erpOrder.sub_total || 0,
    tax: erpOrder.total_taxes_and_charges || 0,
    shipping: erpOrder.custom_shipping_amount || 0,
    discount: erpOrder.discount_amount || 0,
    total: erpOrder.grand_total || 0,
    shippingAddress: shippingAddr || defaultAddress,
    billingAddress: billingAddr || defaultAddress,
    shippingAddressName: String(erpOrder.shipping_address_name || '').trim() || undefined,
    paymentMethod: {
      id: erpOrder.name,
      userId: erpOrder.customer,
      type: 'card',
      isDefault: true,
    },
    trackingNumber: erpOrder.custom_tracking_number,
    estimatedDelivery: erpOrder.delivery_date,
    createdAt: erpOrder.creation || new Date().toISOString(),
    updatedAt: erpOrder.modified || new Date().toISOString(),
  };
};

/**
 * Map ERPNext order status to app status based on docstatus
 * docstatus: 0 = Draft, 1 = Submitted, 2 = Cancelled
 * Also consider the workflow status field for more detailed status
 */
const mapERPOrderStatusFromDocstatus = (docstatus: number, workflowStatus?: string): string => {
  // First check docstatus (primary indicator)
  if (docstatus === 0) {
    return 'pending'; // Draft
  } else if (docstatus === 2) {
    return 'cancelled'; // Cancelled
  } else if (docstatus === 1) {
    // If submitted (docstatus = 1), use workflow status for more detail
    if (workflowStatus) {
      const statusMap: Record<string, string> = {
        'Submitted': 'confirmed',
        'Partial': 'processing',
        'To Deliver': 'to_deliver',
        'Completed': 'completed',
        'Delivered': 'delivered',
        'Returned': 'returned',
      };
      return statusMap[workflowStatus] || 'confirmed';
    }
    return 'confirmed'; // Default for submitted orders
  }
  
  // Fallback to pending if docstatus is unknown
  return 'pending';
};

/**
 * Map ERPNext Sales Order Item to OrderItem
 */
const mapERPSalesOrderItemToOrderItem = (erpItem: any): OrderItem => {
  const lineImageRaw = readErpDocLineImage(erpItem);
  const lineImage = lineImageRaw ? encodeErpFileUrl(lineImageRaw) : '';
  const customColor = String(erpItem.custom_color ?? '').trim();
  const customSize = String(erpItem.custom_size ?? '').trim();
  const itemName = String(erpItem.item_name || erpItem.item_code || '').trim();
  return {
    id: erpItem.name,
    productId: erpItem.item_code,
    product: {
      id: erpItem.item_code,
      name: itemName,
      description: '',
      price: erpItem.rate,
      category: '',
      subcategory: '',
      brand: '',
      images: lineImage ? [lineImage] : [],
      colors: [],
      sizes: [],
      inStock: true,
      rating: 0,
      reviewCount: 0,
      tags: [],
      isNew: false,
      isTrending: false,
      isOnSale: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    ...(customColor
      ? {
          color: {
            id: String(erpItem.custom_color_id || customColor),
            name: customColor,
            hexCode: '#000000',
            inStock: true,
          },
        }
      : {}),
    ...(customSize
      ? {
          size: {
            id: String(erpItem.custom_size_id || customSize),
            name: customSize,
            inStock: true,
          },
        }
      : {}),
    quantity: erpItem.qty,
    price: erpItem.rate,
  };
};

/**
 * Map ERPNext Address to UserAddress type
 */
export const mapERPAddressToUserAddress = (erpAddress: any): UserAddress | undefined => {
  if (!erpAddress) return undefined;

  const line1 = String(erpAddress.address_line1 || '').trim();
  const city = String(erpAddress.city || '').trim();
  const state = String(erpAddress.state || '').trim();
  if (!line1 && !city && !state && !String(erpAddress.address_title || '').trim()) {
    return undefined;
  }

  return {
    id: erpAddress.name || '',
    userId: erpAddress.customer || '',
    type: 'home',
    firstName: erpAddress.first_name || erpAddress.address_title || '',
    lastName: erpAddress.last_name || '',
    addressLine1: erpAddress.address_line1 || '',
    addressLine2: erpAddress.address_line2,
    city: erpAddress.city || '',
    state: erpAddress.state || '',
    postalCode: erpAddress.pincode || '',
    country: erpAddress.country || '',
    phone: erpAddress.phone || '',
    isDefault: erpAddress.is_primary_address === 1,
  };
};

/**
 * Map ERPNext Wishlist to WishlistItem array
 * Fetches product details for each item in the wishlist
 */
export const mapERPWishlistToWishlistItems = async (
  erpWishlist: any,
  client: any
): Promise<WishlistItem[]> => {
  if (!erpWishlist || !erpWishlist.items || erpWishlist.items.length === 0) {
    return [];
  }

  // Fetch product details for each item in parallel
  const wishlistItems = await Promise.allSettled(
    erpWishlist.items.map(async (item: any) => {
      try {
        // Fetch Item by item_code
        const itemCode = item.item_code || item.item;
        const itemDoc = await client.getItem(itemCode);
        const product = mapERPItemToProduct(itemDoc);
        
        return {
          id: item.name || `${erpWishlist.name}-${itemCode}`, // Use child table row name if available
          userId: erpWishlist.user,
          productId: itemCode,
          product: product,
          createdAt: item.creation || erpWishlist.creation || new Date().toISOString(),
        } as WishlistItem;
      } catch (error) {
        // Note: ERPNext child table uses 'item_code' field name, but may also return as 'item'
        const itemCode = item.item_code || item.item;
        console.warn(`Failed to fetch product for wishlist item ${itemCode}:`, error);
        // Return a minimal item if product fetch fails
        return {
          id: item.name || `${erpWishlist.name}-${itemCode}`,
          userId: erpWishlist.user,
          productId: itemCode,
          product: null as any, // Will need to handle this in UI
          createdAt: item.creation || erpWishlist.creation || new Date().toISOString(),
        } as WishlistItem;
      }
    })
  );

  // Filter out failed items and return successful ones
  return wishlistItems
    .filter((result) => result.status === 'fulfilled')
    .map((result) => (result as PromiseFulfilledResult<WishlistItem>).value);
};

/**
 * Map UserAddress to ERPNext Address data
 */
export const mapUserAddressToERPAddress = (address: UserAddress) => {
  return {
    address_type: 'Shipping',
    first_name: address.firstName,
    last_name: address.lastName,
    address_line1: address.addressLine1,
    address_line2: address.addressLine2,
    city: address.city,
    state: address.state,
    pincode: address.postalCode,
    country: address.country,
    phone: address.phone,
    is_primary_address: address.isDefault ? 1 : 0,
  };
};

/**
 * Map ERPNext Item Group to Category type
 */
export const mapERPItemGroupToCategory = (erpGroup: any): Category => {
  return {
    id: erpGroup.name,
    name: erpGroup.item_group_name || erpGroup.name,
    slug: erpGroup.name.toLowerCase().replace(/\s+/g, '-'),
    image: erpGroup.image || '',
    description: erpGroup.description,
    parentId: erpGroup.parent_item_group,
    // Add additional fields for hierarchy filtering
    isGroup: erpGroup.is_group,
    parentItemGroup: erpGroup.parent_item_group,
  };
};

/**
 * Map cart items to ERPNext Sales Order format
 */
export const mapCartToERPSalesOrder = (
  cart: CartItem[],
  customerId: string,
  company: string
) => {
  return {
    customer: customerId,
    company: company,
    items: cart.map((item) => {
      const row: Record<string, unknown> = {
        item_code: item.productId,
        qty: item.quantity,
        rate: item.price,
      };
      const color = item.color?.name?.trim();
      const size = item.size?.name?.trim();
      if (color) row.custom_color = color;
      if (size) row.custom_size = size;
      return row;
    }),
  };
};

/**
 * Transform ERPNext list response
 */
export const transformERPListResponse = <T>(
  data: any[],
  mapper: (item: any) => T
): T[] => {
  return data.map(mapper);
};

/**
 * Map ERPNext Item Review to ProductReview type
 */
export const mapERPItemReviewToProductReview = (erpReview: any, websiteItemName: string): ProductReview => {
  // Extract user name from user field (could be email or name)
  const userName = erpReview.user || erpReview.customer || 'Anonymous';
  // If it's an email, extract the name part
  const displayName = userName.includes('@') 
    ? userName.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    : userName;

  // Parse rating as a float from ERPNext
  // Use custom_rating_float field (Float field) - fallback to rating field if not available
  // Handle various formats: number, string, or null/undefined
  let rating = 0;
  
  // Try custom_rating_float first, then fallback to rating field
  const ratingSource = erpReview.custom_rating_float !== null && erpReview.custom_rating_float !== undefined
    ? erpReview.custom_rating_float
    : erpReview.rating;
  
  if (ratingSource !== null && ratingSource !== undefined) {
    if (typeof ratingSource === 'number') {
      rating = ratingSource;
    } else if (typeof ratingSource === 'string') {
      rating = parseFloat(ratingSource);
      if (isNaN(rating)) {
        rating = 0;
      }
    }
  }
  
  // Debug: Log rating parsing
  console.log(`Review ${erpReview.name}: custom_rating_float =`, erpReview.custom_rating_float, 'rating =', erpReview.rating, 'parsed =', rating);
  
  // Ensure rating is between 0 and 5 (keep as float, don't round)
  const normalizedRating = Math.max(0, Math.min(5, rating));

  return {
    id: erpReview.name,
    productId: erpReview.website_item || websiteItemName,
    userId: erpReview.user || erpReview.customer || '',
    userName: displayName,
    userAvatar: undefined, // ERPNext doesn't typically store avatars in reviews
    rating: normalizedRating,
    title: erpReview.review_title || '',
    comment: stripHtmlTags(erpReview.comment || ''),
    images: undefined, // Item Review doctype doesn't have image fields in the provided schema
    helpfulCount: 0, // Not in the provided schema
    createdAt: erpReview.published_on || erpReview.creation || new Date().toISOString(),
  };
};

/**
 * Map ERPNext Sales Invoice to SalesInvoice type
 */
export const mapERPSalesInvoiceToSalesInvoice = (erpInvoice: any): SalesInvoice => {
  // Use posting_date if available, otherwise fallback to date or creation
  const invoiceDate = erpInvoice.posting_date || erpInvoice.date || erpInvoice.creation || '';
  
  // Items are only available when fetching the full document, not in list queries
  // For list queries, items will be empty array (will be fetched when viewing details)
  const items = erpInvoice.items && Array.isArray(erpInvoice.items) && erpInvoice.items.length > 0
    ? erpInvoice.items.map((item: any) => mapERPSalesInvoiceItemToSalesInvoiceItem(item))
    : [];
  
  return {
    id: erpInvoice.name,
    invoiceNumber: erpInvoice.name,
    customer: erpInvoice.customer || '',
    date: invoiceDate,
    postingTime: erpInvoice.posting_time || undefined,
    grandTotal: erpInvoice.grand_total || 0,
    status: erpInvoice.status || 'Draft',
    items: items,
  };
};

/**
 * Map ERPNext Sales Invoice Item to SalesInvoiceItem type
 */
const mapERPSalesInvoiceItemToSalesInvoiceItem = (erpItem: any): SalesInvoiceItem => {
  return {
    itemCode: erpItem.item_code || '',
    itemName: erpItem.item_name || undefined,
    quantity: erpItem.qty || erpItem.quantity || 0,
    rate: erpItem.rate || 0,
    amount: erpItem.amount || 0,
  };
};
