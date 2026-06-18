'use client';

import { useState, useEffect } from 'react';
import { LoginForm } from '../upload/login-form';
import { ClientsView } from './clients-view';

export default function ClientsPage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    // Check auth by hitting a guarded endpoint (GET /api/clients is cookie-protected).
    fetch('/api/clients')
      .then((res) => setAuthenticated(res.status !== 401))
      .catch(() => setAuthenticated(false));
  }, []);

  if (authenticated === null) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-stone-300 border-t-stone-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!authenticated) {
    return <LoginForm onSuccess={() => setAuthenticated(true)} />;
  }

  return <ClientsView />;
}
