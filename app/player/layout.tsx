import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Player',
};

/**
 * Same embed contract as app/widget/layout.tsx, for the same reasons — read that file's
 * comment before changing this one, because the mistakes it documents apply here too.
 *
 * In short: this is a NESTED layout, so it must not return its own <html>/<body>. Doing so
 * ships two of each, browsers discard the inner pair, and the transparent background and
 * height overrides silently stop applying. Inheriting the root layout is also what loads
 * globals.css and the brand fonts, which this route wants.
 *
 * Deliberately a separate file rather than a shared one with the widget. They happen to
 * agree today, but they are embedded on different pages with different hosts, and the first
 * time one needs a different treatment a shared layout would be the wrong place to find out.
 */
export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
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
