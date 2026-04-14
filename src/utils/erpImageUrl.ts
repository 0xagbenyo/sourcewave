/**
 * ERPNext file paths often include spaces/parentheses (e.g. "download (1).jpg").
 * React Native Image requires each path segment to be percent-encoded.
 * Full URLs from the API may arrive with raw spaces — encode pathname segments only.
 */

import { getERPNextBaseUrl } from '../services/erpnext';

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
