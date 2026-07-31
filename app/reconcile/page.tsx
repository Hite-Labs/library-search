'use client';

import { useState, useEffect } from 'react';
import { LoginForm } from '@/components/LoginForm';
import { ReconcileView } from './reconcile-view';

export default function ReconcilePage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    // /api/cohorts is behind the same operator gate and is cheap — using it as the auth
    // probe avoids running the (slower) reconciliation just to test the cookie.
    fetch('/api/cohorts')
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
  return <ReconcileView />;
}
