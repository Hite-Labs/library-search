'use client';

import { use, useState, useEffect } from 'react';
import { LoginForm } from '../../upload/login-form';
import { CohortDetailView } from './detail-view';

export default function CohortDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
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
  return <CohortDetailView cohortId={id} />;
}
