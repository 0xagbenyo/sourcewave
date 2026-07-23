/** Redact secrets before logging objects that may contain keys, tokens, or passwords. */
const SECRET_PATTERNS = [
  /sk_(test|live)_[a-zA-Z0-9]+/gi,
  /pk_(test|live)_[a-zA-Z0-9]+/gi,
  /(?:api[_-]?secret|api[_-]?key|password|pwd|token|authorization|csrf)[\s:=]+[^\s,}"']+/gi,
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, (match) => {
      const key = match.split(/[:=\s]/)[0];
      return `${key}=[REDACTED]`;
    });
  }
  return out;
}

export function redactSecretsDeep<T>(value: T): T {
  if (value == null || typeof value !== 'object') {
    if (typeof value === 'string') return redactSecrets(value) as T;
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSecretsDeep(item)) as T;
  }
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    if (
      lower.includes('password') ||
      lower.includes('secret') ||
      lower.includes('token') ||
      lower === 'authorization' ||
      lower === 'pwd'
    ) {
      out[key] = '[REDACTED]';
    } else {
      out[key] = redactSecretsDeep(v);
    }
  }
  return out as T;
}
