/**
 * Machine-translate English UI strings to Simplified Chinese.
 * Prefer EXPO_PUBLIC_GOOGLE_TRANSLATE_API_KEY (Google Cloud Translation v2).
 * Falls back to public Lingva mirrors (best-effort; may rate-limit).
 */

const LINGVA_HOSTS = ['lingva.ml', 'lingva.garudalinux.org'] as const;

async function googleTranslateBatch(texts: string[], apiKey: string): Promise<string[]> {
  const out: string[] = [];
  const chunkSize = 80;
  for (let i = 0; i < texts.length; i += chunkSize) {
    const chunk = texts.slice(i, i + chunkSize);
    const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: chunk,
        source: 'en',
        target: 'zh-CN',
        format: 'text',
      }),
    });
    const data = (await res.json()) as {
      data?: { translations?: { translatedText: string }[] };
      error?: { message?: string };
    };
    if (!data.data?.translations?.length) {
      throw new Error(data.error?.message || 'Google Translate returned no translations');
    }
    out.push(...data.data.translations.map((t) => t.translatedText));
  }
  return out;
}

async function lingvaTranslateOne(text: string, host: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return text;
  const encoded = encodeURIComponent(trimmed);
  const url = `https://${host}/api/v1/en/zh-CN/${encoded}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Lingva HTTP ${res.status}`);
  }
  const data = (await res.json()) as { translation?: string };
  if (typeof data.translation !== 'string') {
    throw new Error('Lingva: missing translation field');
  }
  return data.translation;
}

async function lingvaTranslateBatch(texts: string[]): Promise<string[]> {
  const results: string[] = [];
  for (let i = 0; i < texts.length; i++) {
    let lastErr: unknown;
    for (const host of LINGVA_HOSTS) {
      try {
        const tr = await lingvaTranslateOne(texts[i], host);
        results.push(tr);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (lastErr) {
      // Keep original English for this key; avoid logging once per string (can be hundreds).
      results.push(texts[i]);
    }
    if (i < texts.length - 1) {
      await new Promise((r) => setTimeout(r, 120));
    }
  }
  return results;
}

/**
 * Public Lingva instances often return 403 from mobile apps. Fail fast so we do not
 * hammer them once per UI string.
 */
async function assertLingvaReachable(): Promise<void> {
  let lastErr: unknown;
  for (const host of LINGVA_HOSTS) {
    try {
      await lingvaTranslateOne('Hi', host);
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    `Lingva machine translation is not available (${String(lastErr)}). ` +
      'Add EXPO_PUBLIC_GOOGLE_TRANSLATE_API_KEY for Chinese UI, or use English in language settings.'
  );
}

export async function translateEnglishStringsToZhCN(texts: string[]): Promise<string[]> {
  const key = process.env.EXPO_PUBLIC_GOOGLE_TRANSLATE_API_KEY?.trim();
  if (key) {
    return googleTranslateBatch(texts, key);
  }
  await assertLingvaReachable();
  return lingvaTranslateBatch(texts);
}
