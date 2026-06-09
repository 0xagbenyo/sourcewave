/**
 * Stable keys for Contact us → ERPNext Issue subject (labels from i18n `contactUs.topics.*`).
 */
export const CONTACT_US_TOPIC_KEYS = [
  'accountLogin',
  'subscriptionBilling',
  'ordersDelivery',
  'invoicesPayments',
  'sourcingQuotes',
  'supplierMessaging',
  'collaborationPartnership',
  'technicalBug',
  'featureRequest',
  'privacyData',
  'other',
] as const;

export type ContactUsTopicKey = (typeof CONTACT_US_TOPIC_KEYS)[number];
