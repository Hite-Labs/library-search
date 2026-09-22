/**
 * Which pages are allowed to embed our iframes and post messages into them.
 *
 * This list existed in two hand-maintained copies — WidgetRoot's postMessage check and the
 * `frame-ancestors` CSP in next.config.ts — and they had already drifted once, in the
 * direction that breaks things silently: the CSP was missing the apex `showyourspark.com`
 * while the JS check already trusted it, so on the real member page the browser refused the
 * frame outright and search never appeared. The comment in next.config.ts still records it.
 *
 * Adding the coaching player would have made a third copy. So the list lives here, and both
 * the runtime check and the CSP string are built from it. A new domain is now one edit.
 *
 * NOT shared with app/api/portal/route.ts, which has its own narrower allowlist derived from
 * NEXT_PUBLIC_PORTAL_LOGIN_URL. That one governs CORS on a credentialed API rather than who
 * may frame a page, and the two answering the same question today does not mean they should
 * be forced to answer together.
 */

/**
 * Trusted hosts, and whether the APEX itself is embeddable or only its subdomains.
 *
 * `apex: true` for showyourspark.com because the live member site is served from it — that
 * is precisely the entry whose absence from the CSP caused the outage above. The Webflow
 * domains are subdomain-only: member pages live at `something.webflow.io`, never at
 * `webflow.io` itself, which is Webflow's own marketing site. Granting those apexes would
 * widen the CSP for nothing, so the distinction is kept rather than flattened.
 */
const TRUSTED_HOSTS = [
  { host: 'showyourspark.com', apex: true },
  { host: 'webflow.io', apex: false },
  { host: 'webflow.com', apex: false },
  { host: 'webflow-ext.com', apex: false },
] as const;

/**
 * Is this origin one we accept a framed message from?
 *
 * Same-origin always passes: the route is reachable directly, and during local development
 * there is no Webflow page at all.
 */
export function isTrustedParent(origin: string): boolean {
  if (typeof window !== 'undefined' && origin === window.location.origin) return true;
  try {
    const host = new URL(origin).hostname;
    return TRUSTED_HOSTS.some(
      (t) => host.endsWith(`.${t.host}`) || (t.apex && host === t.host),
    );
  } catch {
    // A malformed origin is not a trusted one.
    return false;
  }
}

/**
 * The `frame-ancestors` value for a route meant to be embedded.
 *
 * Built from the same list rather than written out again. Note the shape differs from the
 * host check: CSP needs a scheme and an explicit wildcard, so each entry contributes both
 * `https://host` and `https://*.host`.
 */
export const FRAME_ANCESTORS = [
  "frame-ancestors 'self'",
  ...TRUSTED_HOSTS.flatMap((t) =>
    t.apex ? [`https://${t.host}`, `https://*.${t.host}`] : [`https://*.${t.host}`],
  ),
].join(' ');
