'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/upload', label: 'Upload' },
  { href: '/clients', label: 'Clients' },
  { href: '/cohorts', label: 'Cohorts' },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="bg-white border-b border-stone-200">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <nav className="flex items-center gap-1">
          <span className="text-sm font-semibold text-stone-800 mr-4">Show Your Spark</span>
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + '/');
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-stone-800 text-white'
                    : 'text-stone-600 hover:bg-stone-100'
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
          className="text-xs text-stone-400 hover:text-stone-600"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
