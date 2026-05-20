import { Category } from '../types';

export type ItemGroupOption = { id: string; name: string };

export const isTopLevelItemGroupParent = (parent: string | undefined | null): boolean => {
	const p = String(parent ?? '').trim();
	return p === '' || p === 'All Item Groups' || p === 'All Items Group';
};

/** Parents and their subcategories for sourcing item-category picker. */
export const buildSourcingCategoryOptions = (allGroups: any[]): ItemGroupOption[] => {
	const parents = allGroups.filter(
		(group: any) =>
			Number(group?.is_group) === 1 &&
			isTopLevelItemGroupParent(group?.parent_item_group)
	);

	const options: ItemGroupOption[] = [];
	for (const parent of parents) {
		const parentId = parent.name;
		const parentName = parent.item_group_name || parent.name;
		options.push({ id: parentId, name: parentName });

		allGroups
			.filter((group: any) => {
				const p = String(group?.parent_item_group || '').trim();
				return p === parentId || p === parentName;
			})
			.forEach((child: any) => {
				options.push({
					id: child.name,
					name: child.item_group_name || child.name,
				});
			});
	}
	return options;
};

/** Top-level category → all descendant groups; subcategory → that group only. */
export const resolveItemGroupIdsForSourcingCategory = (
	categoryId: string,
	categoryTree: Category[]
): string[] => {
	if (!categoryId) return [];
	const row = categoryTree.find((c) => c.id === categoryId);
	if (!row) return [categoryId];
	if (isTopLevelItemGroupParent(row.parentId)) {
		return collectDescendantItemGroupIds(categoryId, categoryTree);
	}
	return [categoryId];
};

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
