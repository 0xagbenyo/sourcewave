/**
 * Buyer routes that require an active SourceWave subscription (supplier messaging / directory).
 * Supplier portal tab `SupplierMessages` is excluded.
 */
export function buyerRavenRouteNeedsSubscription(routeName: string): boolean {
  return routeName === 'Suppliers' || routeName === 'RavenChatInbox' || routeName === 'RavenUIMessages';
}
