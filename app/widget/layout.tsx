import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Content Search',
};

/**
 * The widget is embedded in Webflow via an iframe (public/embed.js), so it needs a
 * transparent background and no page chrome — the host page supplies both.
 *
 * This used to return its own <html>/<body>. That looked right but isn't: this is a
 * NESTED layout, not a root layout, so it rendered *inside* app/layout.tsx's document
 * and the built page shipped two <html> and two <body> tags. Browsers discard the inner
 * pair as invalid nesting, which meant `bg-transparent m-0 p-0` never applied — the
 * iframe painted the dashboard's cream `--background` on Lindsay's page — and the
 * surviving `min-h-full` body made the frame unable to report a shrinking height back
 * to embed.js (see notifyHeight in WidgetRoot).
 *
 * Inheriting the root layout is what loads globals.css and the brand fonts here, which
 * we want. So rather than fight it, override just the two things the embed needs:
 * the background, and the root element's minimum height.
 */
export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/*
        Scoped to the embed only. `!important` because these override globals.css's
        `body { background: … }` and the root layout's `min-h-full` utility, both of
        which are correct for the dashboard and wrong inside an iframe.
      */}
      <style>{`
        html, body {
          background: transparent !important;
          min-height: 0 !important;
          margin: 0;
          padding: 0;
        }
      `}</style>
      {children}
    </>
  );
}
