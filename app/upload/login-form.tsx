'use client';

import { useState, FormEvent } from 'react';
import Image from 'next/image';

interface LoginFormProps {
  onSuccess: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();

      if (res.status === 429) {
        const mins = Math.ceil(data.retryAfterSeconds / 60);
        setError(`Too many attempts. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`);
        return;
      }
      if (!res.ok) {
        setError('Incorrect password.');
        return;
      }
      onSuccess();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-forest flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-petal rounded-3xl shadow-xl p-8 text-center">
        <Image src="/sys-mark.png" alt="Show Your Spark" width={56} height={56} className="rounded-lg mx-auto mb-4" />
        <h1 className="font-serif text-2xl text-slate mb-1">Show Your Spark</h1>
        <p className="font-label text-xs text-plum mb-6">Dashboard Access</p>

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <div>
            <label htmlFor="password" className="block font-label text-xs text-slate/70 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-slate/20 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold"
              autoFocus
              required
            />
          </div>

          {error && (
            <p className="text-sm text-scarlet bg-scarlet/10 border border-scarlet/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading || !password} className="btn-spark w-full">
            {loading ? 'Checking…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
