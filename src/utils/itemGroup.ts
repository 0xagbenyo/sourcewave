import { Category } from '../types';

/**
 * Collect Item Group `name` values in the subtree under `rootGroupId` (including the root).
 * Used to query `Item` rows where `item_group` can be the parent or any nested child group.
 */
export function collectDescendantItemGroupIds(rootGroupId: string, allCategories: Category[]): string[] {
	if (!rootGroupId || !allCategories?.length) {
		return rootGroupId ? [rootGroupId] : [];
	}
	const result = new Set<string>([rootGroupId]);
	let added = true;
	while (added) {
		added = false;
		for (const c of allCategories) {
			if (!c.id || !c.parentId) continue;
			if (result.has(c.parentId) && !result.has(c.id)) {
				result.add(c.id);
				added = true;
			}
		}
	}
	return Array.from(result);
}
