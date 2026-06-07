import { buildAuthenticatedErpImageSource } from './erpImageUrl';

/** Chunked binary → base64 without blowing the stack on large PDFs. */
function uint8ArrayToBase64(bytes: Uint8Array): string {
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
  const src = buildAuthenticatedErpImageSource(uri);
  if (!src?.uri) throw new Error('Invalid URL');
  const res = await fetch(src.uri, { headers: src.headers as Record<string, string> | undefined });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const ab = await res.arrayBuffer();
  return uint8ArrayToBase64(new Uint8Array(ab));
}
