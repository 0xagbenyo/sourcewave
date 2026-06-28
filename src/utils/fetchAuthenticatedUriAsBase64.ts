import { buildAuthenticatedErpImageSource } from './erpImageUrl';

/** Chunked binary → base64 without blowing the stack on large PDFs. */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    for (let j = 0; j < slice.length; j++) {
      binary += String.fromCharCode(slice[j]!);
    }
  }
  return btoa(binary);
}

/**
 * GET a same-origin / ERP-authenticated URL and return base64 body (for Android WebView PDF inline preview).
 */
export async function fetchAuthenticatedUriAsBase64(uri: string): Promise<string> {
  const low = uri.trim().toLowerCase();
  if (low.includes('.pdf') || low.includes('download_pdf') || low.includes('print_format')) {
    const { fetchAuthenticatedPdfBase64 } = await import('./fetchAuthenticatedPdfBase64');
    return fetchAuthenticatedPdfBase64(uri);
  }

  const src = buildAuthenticatedErpImageSource(uri);
  if (!src?.uri) throw new Error('Invalid URL');
  const { ravenFetchBinary } = await import('../services/frappeRavenSession');
  const { data, contentType } = await ravenFetchBinary(src.uri);
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('text/html') || ct.includes('application/json')) {
    throw new Error(`Request failed (unexpected ${contentType || 'response'})`);
  }
  return uint8ArrayToBase64(new Uint8Array(data));
}
