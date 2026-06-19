import type { Metadata } from 'next';
import { Baskervville, Oswald, Manrope } from 'next/font/google';
import './globals.css';

const baskervville = Baskervville({
  variable: '--font-baskervville',
  subsets: ['latin'],
  weight: ['400'],
});
const oswald = Oswald({
  variable: '--font-oswald',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
});
const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
});

export const metadata: Metadata = {
  title: 'Show Your Spark Dashboard',
  description: 'Internal content management and client coaching tools',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${baskervville.variable} ${oswald.variable} ${manrope.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
