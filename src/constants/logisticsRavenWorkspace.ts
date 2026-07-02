/** Raven workspace display/name hint for logistics companies (buyer shares delivery notes here). */
export const LOGISTICS_RAVEN_WORKSPACE_NAME = 'Logistics';

export function isLogisticsRavenWorkspace(name: string | null | undefined): boolean {
  const n = String(name || '').trim().toLowerCase();
  return n === LOGISTICS_RAVEN_WORKSPACE_NAME.toLowerCase();
}
