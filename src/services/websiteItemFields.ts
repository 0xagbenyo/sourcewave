/**
 * Website Item Fields Reference
 * 
 * This file fetches and documents all available fields from the Website Item doctype.
 * Use this as a reference when mapping or displaying Website Item data.
 */

import { getERPNextClient } from './erpnext';

/**
 * Fetch all Website Item fields from ERPNext by fetching a real item
 * This helps us understand what fields are actually available from the API
 * 
 * @param websiteItemName - Optional. If not provided, fetches the first available item
 * @returns Object with all fields and their values, or null if error
 */
export const fetchWebsiteItemFields = async (websiteItemName?: string): Promise<Record<string, any> | null> => {
  try {
    const client = getERPNextClient();
    
    // If no item name provided, get the first available item
    let itemName = websiteItemName;
    if (!itemName) {
      const items = await client.getNewArrivals(1);
      if (items.length === 0) {
        console.warn('No Website Items found to fetch fields from');
        return null;
      }
      itemName = items[0].name;
    }
    
    // Fetch item with all fields using the new method
    if (!itemName) {
      return null;
    }
    
    const response = await client.getWebsiteItemAllFields(itemName);
    return response || null;
  } catch (error) {
    console.error('Error fetching Website Item fields:', error);
    return null;
  }
};

/**
 * Get all field names from a fetched Website Item
 * @param websiteItemName - Optional. If not provided, fetches the first available item
 * @returns Array of field names
 */
export const fetchWebsiteItemFieldNames = async (websiteItemName?: string): Promise<string[]> => {
  const item = await fetchWebsiteItemFields(websiteItemName);
  if (!item) return [];
  return Object.keys(item);
};

/**
 * Log all Website Item fields to console (for debugging/reference)
 * This is useful to see what fields are actually available from the API
 * 
 * @param websiteItemName - Optional. If not provided, fetches the first available item
 */
export const logWebsiteItemFields = async (websiteItemName?: string): Promise<void> => {
  const item = await fetchWebsiteItemFields(websiteItemName);
  if (!item) {
    console.log('No Website Item found to log fields');
    return;
  }
  
  console.log('=== Website Item Fields ===');
  console.log('Item Name:', item.name || 'N/A');
  console.log('\nAll Fields:');
  Object.keys(item).forEach((key) => {
    const value = item[key];
    const valueType = Array.isArray(value) ? 'array' : typeof value;
    const valuePreview = Array.isArray(value) 
      ? `[${value.length} items]`
      : typeof value === 'object' && value !== null
      ? '{object}'
      : String(value).substring(0, 50);
    console.log(`  ${key}: (${valueType}) ${valuePreview}`);
  });
  console.log('\nTotal Fields:', Object.keys(item).length);
};

/**
 * Complete list of Website Item fields (as documented)
 * These are the fields available in the Website Item doctype
 */
export const WEBSITE_ITEM_FIELDS = {
  // Core Identification
  name: 'Website Item Name (ID)',
  web_item_name: 'Website Item Display Name',
  route: 'Product URL Slug',
  published: 'Published Status (1 = published, 0 = unpublished)',
  
  // Item Link
  item_code: 'Linked Item Code',
  item_name: 'Item Name',
  item_group: 'Item Group/Category',
  stock_uom: 'Stock Unit of Measure',
  
  // Company & Brand
  custom_company: 'Company Name (Custom Field)',
  brand: 'Brand Name',
  
  // Descriptions
  description: 'Item Description',
  short_description: 'Short Description (for listings)',
  web_long_description: 'Long Description (for detail pages)',
  
  // Images
  website_image: 'Main Product Image',
  website_image_alt: 'Image Alt Text',
  thumbnail: 'Thumbnail Image',
  slideshow: 'Slideshow Link',
  
  // Stock & Warehouse
  website_warehouse: 'Website Warehouse',
  on_backorder: 'Allow Backorder (1 = yes, 0 = no)',
  
  // Display & Content
  website_specifications: 'Product Specifications Table (colors, sizes, etc.)',
  show_tabbed_section: 'Show Tabbed Section',
  tabs: 'Additional Tabs Table',
  recommended_items: 'Recommended/Similar Items Table',
  offers: 'Offers/Promotions Table',
  
  // SEO & Ranking
  ranking: 'Product Ranking (higher = more prominent)',
  set_meta_tags: 'Meta Tags Button',
  website_item_groups: 'Website Item Groups Table',
  
  // System Fields
  creation: 'Creation Date',
  modified: 'Last Modified Date',
  owner: 'Owner',
  modified_by: 'Modified By',
  docstatus: 'Document Status',
  
  // Additional ERPNext Standard Fields
  idx: 'Index',
  doctype: 'Document Type',
} as const;

/**
 * Get all field names as an array
 */
export const getAllWebsiteItemFieldNames = (): string[] => {
  return Object.keys(WEBSITE_ITEM_FIELDS);
};

/**
 * Get fields grouped by category for easier reference
 */
export const WEBSITE_ITEM_FIELDS_BY_CATEGORY = {
  core: ['name', 'web_item_name', 'route', 'published'],
  itemLink: ['item_code', 'item_name', 'item_group', 'stock_uom'],
  company: ['custom_company', 'brand'],
  descriptions: ['description', 'short_description', 'web_long_description'],
  images: ['website_image', 'website_image_alt', 'thumbnail', 'slideshow'],
  stock: ['website_warehouse', 'on_backorder'],
  display: ['website_specifications', 'show_tabbed_section', 'tabs', 'recommended_items', 'offers'],
  seo: ['ranking', 'set_meta_tags', 'website_item_groups'],
  system: ['creation', 'modified', 'owner', 'modified_by', 'docstatus'],
} as const;

/**
 * Recommended fields for different use cases
 */
export const RECOMMENDED_FIELDS = {
  // For product listings (grid/list views)
  listing: [
    'name',
    'web_item_name',
    'short_description',
    'website_image',
    'thumbnail',
    'custom_company',
    'brand',
    'item_group',
    'ranking',
    'published',
  ],
  
  // For product detail pages
  detail: [
    'name',
    'web_item_name',
    'web_long_description',
    'short_description',
    'website_image',
    'website_image_alt',
    'thumbnail',
    'custom_company',
    'brand',
    'item_group',
    'website_specifications',
    'website_warehouse',
    'on_backorder',
    'ranking',
    'recommended_items',
    'offers',
    'route',
  ],
  
  // For search results
  search: [
    'name',
    'web_item_name',
    'short_description',
    'website_image',
    'thumbnail',
    'custom_company',
    'brand',
    'item_group',
    'ranking',
  ],
  
  // Minimal fields (for performance)
  minimal: [
    'name',
    'web_item_name',
    'website_image',
    'custom_company',
    'published',
  ],
} as const;

/**
 * Field descriptions for documentation
 */
export const getFieldDescription = (fieldName: string): string => {
  return WEBSITE_ITEM_FIELDS[fieldName as keyof typeof WEBSITE_ITEM_FIELDS] || 'Unknown field';
};

/**
 * Check if a field exists in Website Item
 */
export const isWebsiteItemField = (fieldName: string): boolean => {
  return fieldName in WEBSITE_ITEM_FIELDS;
};

/**
 * Generate TypeScript interface from fetched Website Item fields
 * Useful for creating type definitions based on actual API response
 * 
 * @param websiteItemName - Optional. If not provided, fetches the first available item
 * @returns TypeScript interface string
 */
export const generateTypeScriptInterface = async (websiteItemName?: string): Promise<string> => {
  const item = await fetchWebsiteItemFields(websiteItemName);
  if (!item) {
    return '// No Website Item found to generate interface';
  }
  
  let interfaceStr = 'export interface WebsiteItem {\n';
  
  Object.keys(item).forEach((key) => {
    const value = item[key];
    let type = 'any';
    
    if (value === null || value === undefined) {
      type = 'any | null';
    } else if (typeof value === 'string') {
      type = 'string';
    } else if (typeof value === 'number') {
      type = 'number';
    } else if (typeof value === 'boolean') {
      type = 'boolean';
    } else if (Array.isArray(value)) {
      type = 'any[]';
    } else if (typeof value === 'object') {
      type = 'Record<string, any>';
    }
    
    interfaceStr += `  ${key}?: ${type};\n`;
  });
  
  interfaceStr += '}';
  return interfaceStr;
};

/**
 * Compare documented fields with actual API fields
 * Helps identify missing or extra fields
 * 
 * @param websiteItemName - Optional. If not provided, fetches the first available item
 * @returns Object with comparison results
 */
export const compareFields = async (websiteItemName?: string): Promise<{
  documented: string[];
  actual: string[];
  missing: string[];
  extra: string[];
}> => {
  const documented = getAllWebsiteItemFieldNames();
  const actual = await fetchWebsiteItemFieldNames(websiteItemName);
  
  const missing = actual.filter(field => !documented.includes(field));
  const extra = documented.filter(field => !actual.includes(field));
  
  return {
    documented,
    actual,
    missing,
    extra,
  };
};

