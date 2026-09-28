'use client';

import { useState, useEffect } from 'react';
import { LoginForm } from '@/components/LoginForm';
import { AttentionView } from './attention-view';

export default function AttentionPage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    // /api/attention is itself behind the operator gate, so it doubles as the auth probe.
    fetch('/api/attention')
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
  return <AttentionView />;
}
