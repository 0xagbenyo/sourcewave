/**
 * ERPNext file paths often include spaces/parentheses (e.g. "download (1).jpg").
 * React Native Image requires each path segment to be percent-encoded.
 * Full URLs from the API may arrive with raw spaces — encode pathname segments only.
 */

import { getERPNextAuthorizationHeader, getERPNextBaseUrl } from '../services/erpnext';

export function encodeErpFileUrl(raw: string | undefined | null): string {
	if (raw == null || String(raw).trim() === '') return '';
	const s = String(raw).trim();

	if (/^https?:\/\//i.test(s)) {
		try {
			const schemeEnd = s.indexOf('://') + 3;
			const hostSlash = s.indexOf('/', schemeEnd);
			if (hostSlash === -1) return s;
			const origin = s.slice(0, hostSlash);
			const rest = s.slice(hostSlash);
			const hashIdx = rest.indexOf('#');
			const qIdx = rest.indexOf('?');
			let pathEnd = rest.length;
			if (hashIdx >= 0) pathEnd = Math.min(pathEnd, hashIdx);
			if (qIdx >= 0) pathEnd = Math.min(pathEnd, qIdx);
			const path = rest.slice(0, pathEnd);
			const suffix = rest.slice(pathEnd);
			const segments = path.split('/').filter(Boolean);
			const encodedPath =
				'/' +
				segments
					.map((seg) => {
						try {
							return encodeURIComponent(decodeURIComponent(seg));
						} catch {
							return encodeURIComponent(seg);
						}
					})
					.join('/');
			return origin + encodedPath + suffix;
		} catch {
			return s;
		}
	}

	const pathParts = s.split('/').filter(Boolean);
	const encodedPath = '/' + pathParts.map((p) => encodeURIComponent(p)).join('/');
	// Use the current ERPNext base URL from configuration instead of hardcoded URL
	const baseUrl = getERPNextBaseUrl();
	return `${baseUrl}${encodedPath}`;
}

/** Source for expo-image / loaders that honor `headers` (RN `Image` is unreliable on Android). */
export type AuthenticatedErpImageSource = {
	uri: string;
	headers?: { Authorization: string };
};

/**
 * Raven web strips `?…` from Frappe attachment URLs before using them (see `FileMessage.tsx`).
 * Keep query strings for unrelated URLs (e.g. CDN cache keys) — only `/files/` and `/private/files/`.
 */
function stripFrappeAttachmentQueryLikeRavenWeb(uri: string): string {
	if (!uri || uri.startsWith('file:') || uri.startsWith('content:')) return uri;
	try {
		const u = new URL(uri);
		const p = u.pathname.toLowerCase();
		if (p.includes('/files/') || p.includes('/private/files/')) {
			u.search = '';
			return u.toString();
		}
	} catch {
		/* fall through */
	}
	const q = uri.indexOf('?');
	if (q < 0) return uri;
	const head = uri.slice(0, q).toLowerCase();
	if (head.includes('/files/') || head.includes('/private/files/')) {
		return uri.slice(0, q);
	}
	return uri;
}

/**
 * Build an image source for ERP-hosted URLs with Basic auth when needed (private files, same-site).
 * Skips auth for other hosts (e.g. CDNs, placeholders). Local `file:` / `content:` URIs unchanged.
 */
export function buildAuthenticatedErpImageSource(raw: string | undefined | null): AuthenticatedErpImageSource | null {
	if (raw == null || String(raw).trim() === '') return null;
	const trimmed = String(raw).trim();
	if (trimmed.startsWith('data:')) return { uri: trimmed };

	let input = trimmed;
	if (
		!trimmed.startsWith('file:') &&
		!trimmed.startsWith('content:') &&
		!trimmed.startsWith('asset:')
	) {
		const low = trimmed.toLowerCase();
		if (low.includes('/files/') || low.includes('/private/files/')) {
			input = trimmed.split('?')[0].trim();
		}
	}

	let uri =
		trimmed.startsWith('file:') ||
		trimmed.startsWith('content:') ||
		trimmed.startsWith('asset:')
			? trimmed
			: encodeErpFileUrl(input) || input;
	if (!uri) return null;

	if (!trimmed.startsWith('file:') && !trimmed.startsWith('content:') && !trimmed.startsWith('asset:')) {
		uri = stripFrappeAttachmentQueryLikeRavenWeb(uri);
	}

	const auth = getERPNextAuthorizationHeader();
	if (!auth) {
		return { uri };
	}

	const lower = uri.toLowerCase();
	if (lower.includes('/private/files')) {
		return { uri, headers: { Authorization: auth } };
	}

	if (!/^https?:\/\//i.test(uri)) {
		const base = getERPNextBaseUrl().replace(/\/+$/, '');
		const absolute = uri.startsWith('/') ? `${base}${uri}` : `${base}/${uri}`;
		return { uri: absolute, headers: { Authorization: auth } };
	}

	try {
		const base = getERPNextBaseUrl().replace(/\/+$/, '');
		const imageUrl = new URL(uri);
		const baseUrl = new URL(base);
		if (imageUrl.hostname === baseUrl.hostname) {
			return { uri, headers: { Authorization: auth } };
		}
	} catch {
		// leave unauthenticated
	}

	return { uri };
}
