import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Content Search',
};

export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-transparent m-0 p-0">{children}</body>
    </html>
  );
}
