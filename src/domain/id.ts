let fallbackSequence = 0;

/**
 * Create an opaque identifier without relying on Date.now() uniqueness.
 * crypto.randomUUID is available in modern browsers, Capacitor WebView and
 * current Node; the monotonic fallback keeps tests/older WebViews safe.
 */
export function createId(prefix: string): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return `${prefix}-${cryptoApi.randomUUID()}`;

  fallbackSequence = (fallbackSequence + 1) % Number.MAX_SAFE_INTEGER;
  return `${prefix}-${Date.now().toString(36)}-${fallbackSequence.toString(36)}`;
}

