'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/upload', label: 'Upload' },
  { href: '/clients', label: 'Clients' },
  { href: '/cohorts', label: 'Cohorts' },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="bg-forest">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        <nav className="flex items-center gap-1">
          <Link href="/clients" className="flex items-center gap-2.5 mr-5">
            <Image src="/sys-mark.png" alt="Show Your Spark" width={34} height={34} className="rounded-md" />
            <span className="font-serif text-petal text-lg">Dashboard</span>
          </Link>
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + '/');
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`font-label text-sm px-3 py-1.5 transition-colors border-b-2 ${
                  active
                    ? 'text-gold border-gold'
                    : 'text-petal/80 border-transparent hover:text-gold'
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'POST' });
            window.location.href = '/upload';
          }}
          className="font-label text-xs text-petal/60 hover:text-gold transition-colors"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
