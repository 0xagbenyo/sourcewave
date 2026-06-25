import { Category } from '../types';

export type ItemGroupOption = { id: string; name: string };

/** ERPNext root / pseudo item groups that must never appear as user-selectable categories. */
export function isReservedItemGroupName(nameOrLabel: string | undefined | null): boolean {
	const t = String(nameOrLabel ?? '').trim().toLowerCase();
	return t === 'all item groups' || t === 'all items group' || t === 'all item group';
}

export function isReservedItemGroupRow(group: any): boolean {
	if (!group) return true;
	if (isReservedItemGroupName(group.name)) return true;
	if (isReservedItemGroupName(group.item_group_name)) return true;
	return false;
}

export const isTopLevelItemGroupParent = (parent: string | undefined | null): boolean => {
	const p = String(parent ?? '').trim();
	if (!p) return true;
	return isReservedItemGroupName(p);
};

/** Top-level parents for the Categories sidebar (and similar browse UIs). */
export function isItemGroupTopLevelParentRow(group: any, allGroups?: any[]): boolean {
	if (isReservedItemGroupRow(group)) return false;

	const parent = String(group?.parent_item_group ?? group?.parentItemGroup ?? '').trim();
	if (!isTopLevelItemGroupParent(parent)) return false;

	if (Number(group?.is_group ?? group?.isGroup) === 1) return true;

	const id = String(group?.name ?? group?.id ?? '').trim();
	if (!id || !allGroups?.length) return false;

	return allGroups.some((row) => {
		if (isReservedItemGroupRow(row)) return false;
		return String(row?.parent_item_group || '').trim() === id;
	});
}

/** Parents and their subcategories for sourcing item-category picker. */
export const buildSourcingCategoryOptions = (allGroups: any[]): ItemGroupOption[] => {
	const groups = (allGroups || []).filter((g) => !isReservedItemGroupRow(g));

	const parents = groups.filter(
		(group: any) =>
			Number(group?.is_group) === 1 &&
			isTopLevelItemGroupParent(group?.parent_item_group) &&
			!isReservedItemGroupRow(group)
	);

	const options: ItemGroupOption[] = [];
	for (const parent of parents) {
		const parentId = String(parent.name || '').trim();
		if (!parentId || isReservedItemGroupName(parentId)) continue;
		const parentLabel = parent.item_group_name || parent.name;
		options.push({ id: parentId, name: parentLabel });

		// Match children by technical parent id only. Matching display `parentName` duplicates
		// the same child under multiple parents when labels collide (React duplicate keys).
		groups
			.filter((group: any) => {
				const p = String(group?.parent_item_group || '').trim();
				return p === parentId;
			})
			.forEach((child: any) => {
				const cid = String(child.name || '').trim();
				if (!cid || isReservedItemGroupName(cid)) return;
				options.push({
					id: cid,
					name: child.item_group_name || child.name,
				});
			});
	}

	const seen = new Set<string>();
	return options.filter((o) => {
		if (!o.id || seen.has(o.id)) return false;
		seen.add(o.id);
		return true;
	});
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
