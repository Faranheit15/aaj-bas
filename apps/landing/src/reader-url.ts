/**
 * Resolves the reader URL the landing CTA points at.
 *
 * `VITE_APP_URL` is a build-time value, so an unset variable and an empty one are
 * the same misconfiguration. Nullish coalescing alone would let `""` through into
 * `href=""`, which resolves to the landing page itself — a CTA that silently links
 * back to where the reader already is.
 */
export function resolveReaderUrl(configured: string | undefined): string {
  return configured?.trim() || "/";
}
