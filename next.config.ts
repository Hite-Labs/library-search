import type { NextConfig } from 'next';
import path from 'path';
import { FRAME_ANCESTORS } from './lib/widget/trusted-origins';

/**
 * Headers for a route that is embedded in Webflow via an iframe.
 *
 * Both embedded routes get byte-identical treatment from one source. They used to be one
 * hand-written string, and when the coaching player needed the same one it would have become
 * a second copy — which is how the apex showyourspark.com went missing from the CSP once
 * already while the JS origin check already trusted it, so the browser refused the frame and
 * the widget never appeared on the live page.
 *
 * X-Frame-Options is set to ALLOWALL explicitly so CSP frame-ancestors takes full control;
 * a stray default would otherwise override it in some browsers.
 */
const embeddedRouteHeaders = (source: string) => ({
  source,
  headers: [
    { key: 'Content-Security-Policy', value: FRAME_ANCESTORS },
    { key: 'X-Frame-Options', value: 'ALLOWALL' },
  ],
});

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  async headers() {
    return [
      // The search widget, embedded by public/embed.js.
      embeddedRouteHeaders('/widget'),
      // The coaching portal's player, embedded by public/portal.js. Needs its own entry:
      // `source` is an exact match, so /widget's headers do nothing for this route, and
      // without them the browser refuses the frame and a member sees an empty box.
      embeddedRouteHeaders('/player'),
      {
        // CORS for search API (widget calls from same origin via iframe, but allow explicit cross-origin too)
        source: '/api/search',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
        ],
      },
      {
        // portal.js / portal.staging.js are loaded cross-origin by a plain <script src>
        // tag on the Webflow portal page. A script-tag load isn't CORS-restricted, but we
        // set ACAO:* explicitly + nosniff so the content-type is honored. The runtime
        // fetch() these scripts make to /api/portal is CORS'd in that route handler.
        source: '/:file(portal\\.js|portal\\.staging\\.js)',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};

export default nextConfig;
