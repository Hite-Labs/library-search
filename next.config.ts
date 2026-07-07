import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  async headers() {
    return [
      {
        // Allow /widget to be embedded in Webflow iframes
        source: '/widget',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' https://*.webflow.io https://*.webflow.com https://*.webflow-ext.com",
          },
          // Explicitly unset X-Frame-Options so CSP frame-ancestors takes full control
          {
            key: 'X-Frame-Options',
            value: 'ALLOWALL',
          },
        ],
      },
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
