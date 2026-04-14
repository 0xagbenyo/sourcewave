/**
 * Example utility to fetch and log all Website Item fields
 * 
 * This file demonstrates how to use the websiteItemFields utilities
 * to discover and reference all available fields from the API.
 * 
 * Usage:
 * 1. Import and call logWebsiteItemFields() in your component or during development
 * 2. Check the console output to see all available fields
 * 3. Reference the fields in websiteItemFields.ts when mapping data
 */

import { 
  logWebsiteItemFields, 
  fetchWebsiteItemFields,
  fetchWebsiteItemFieldNames,
  generateTypeScriptInterface,
  compareFields
} from '../services/websiteItemFields';

/**
 * Example: Log all fields from the first available Website Item
 */
export const exampleLogFields = async () => {
  console.log('Fetching Website Item fields...');
  await logWebsiteItemFields();
};

/**
 * Example: Get all field names as an array
 */
export const exampleGetFieldNames = async (): Promise<string[]> => {
  const fieldNames = await fetchWebsiteItemFieldNames();
  console.log('Available fields:', fieldNames);
  return fieldNames;
};

/**
 * Example: Get full Website Item object with all fields
 */
export const exampleGetAllFields = async () => {
  const item = await fetchWebsiteItemFields();
  if (item) {
    console.log('Full Website Item object:', item);
    return item;
  }
  return null;
};

/**
 * Example: Generate TypeScript interface from actual API response
 */
export const exampleGenerateInterface = async () => {
  const interfaceStr = await generateTypeScriptInterface();
  console.log('Generated TypeScript Interface:');
  console.log(interfaceStr);
  return interfaceStr;
};

/**
 * Example: Compare documented fields with actual API fields
 */
export const exampleCompareFields = async () => {
  const comparison = await compareFields();
  console.log('Field Comparison:');
  console.log('Documented fields:', comparison.documented.length);
  console.log('Actual API fields:', comparison.actual.length);
  console.log('Missing from documentation:', comparison.missing);
  console.log('Extra in documentation (not in API):', comparison.extra);
  return comparison;
};

/**
 * Run all examples (useful for development/debugging)
 */
export const runAllExamples = async () => {
  console.log('=== Website Item Fields Examples ===\n');
  
  await exampleLogFields();
  console.log('\n---\n');
  
  await exampleGetFieldNames();
  console.log('\n---\n');
  
  await exampleGenerateInterface();
  console.log('\n---\n');
  
  await exampleCompareFields();
};


