import { buildAuthenticatedErpImageSource } from './erpImageUrl';
import { uint8ArrayToBase64 } from './fetchAuthenticatedUriAsBase64';

function looksLikePdfBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  return (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}

function contentTypeLooksLikeAuthFailure(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return ct.includes('text/html') || ct.includes('application/json');
}

/**
 * Download an ERP PDF with session cookie and/or API-key auth; returns raw base64 body.
 */
export async function fetchAuthenticatedPdfBase64(uri: string): Promise<string> {
  const src = buildAuthenticatedErpImageSource(uri);
  if (!src?.uri) throw new Error('Invalid URL');

  const { ravenFetchBinary } = await import('../services/frappeRavenSession');
  const { data, contentType } = await ravenFetchBinary(src.uri);
  if (contentTypeLooksLikeAuthFailure(contentType)) {
    throw new Error('Could not load PDF (check sign-in and permissions).');
  }

  const bytes = new Uint8Array(data);
  if (!looksLikePdfBytes(bytes)) {
    throw new Error('Response was not a PDF file.');
  }
  return uint8ArrayToBase64(bytes);
}
