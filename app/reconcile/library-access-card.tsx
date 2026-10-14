'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface Candidate {
  id: string;
  name: string;
  email: string;
  memberstack_id: string | null;
}

interface LibraryAccessData {
  ok: boolean;
  configured: boolean;
  days: number;
  candidates: Candidate[];
  error?: string;
}

/**
 * Coaching library access (lib/library-access.ts): how many days it lasts after a client's
 * last session, and the one-off grant for clients who were already being coached before this
 * existed. New clients get it automatically, so once the list is empty this card is just the
 * setting.
 */
export function LibraryAccessCard() {
  const [data, setData] = useState<LibraryAccessData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState('');
  const [saving, setSaving] = useState(false);
  const [granting, setGranting] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/reconcile/library-access');
      const d = await res.json();
      if (!d.ok) throw new Error(d.error ?? 'Could not load library access');
      setData(d);
      setDays(String(d.days));
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveDays() {
    const n = Number(days);
    if (!Number.isInteger(n) || n < 1 || n > 365) {
      setError('Days must be a whole number from 1 to 365.');
      return;
    }
    setSaving(true); setError(null); setNote(null);
    try {
      const res = await fetch('/api/reconcile/library-access', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: n }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error ?? 'Save failed');
      setNote(`Saved — access now lasts ${n} days after a client's last session.`);
      await load();
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setSaving(false);
    }
  }

  async function grantAll() {
    if (!data) return;
    const n = data.candidates.length;
    if (!window.confirm(
      `Give library access to ${n} current coaching ${n === 1 ? 'client' : 'clients'}?\n\n` +
      `They can use the library straight away, until ${data.days} days after their last ` +
      `session (or ${data.days} days from today, whichever is later).`,
    )) return;
    setGranting(true); setError(null); setNote(null);
    try {
      const res = await fetch('/api/reconcile/library-access', { method: 'POST' });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error ?? 'Grant failed');
      const skipped = d.skipped as { name: string; email: string; reason: string }[];
      setNote(
        `Gave library access to ${d.granted} ${d.granted === 1 ? 'client' : 'clients'}.` +
        (skipped.length
          ? ` Skipped ${skipped.length}: ` +
            skipped.map((s) => `${s.name || s.email} (${s.reason})`).join('; ')
          : ''),
      );
      await load();
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setGranting(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gold/20 p-6 mb-4">
      <h2 className="font-label text-xs text-plum mb-1">Coaching library access</h2>
      <p className="text-xs text-slate/60 mb-4">
        Individual coaching clients get the audio library while they&apos;re coached, and for a
        number of days after their last logged session. When it runs out, the library page
        shows them a different pitch for the same number of days.
      </p>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {data && !data.configured && (
        <p className="text-sm text-slate mb-3">
          Not switched on yet: MEMBERSTACK_MEMBERSHIP_INCLUDED_PLAN_ID isn&apos;t set on the server.
        </p>
      )}

      {data && (
        <>
          <div className="flex items-center gap-2 mb-4">
            <label htmlFor="library-days" className="text-sm text-slate">Access lasts</label>
            <input
              id="library-days"
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="w-20 border border-gold/30 rounded-lg px-2 py-1 text-sm"
            />
            <span className="text-sm text-slate">days after the last session</span>
            {days !== String(data.days) && (
              <button type="button" onClick={saveDays} disabled={saving}
                className="btn-spark-outline text-xs px-3 py-1.5 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
            )}
          </div>

          {data.configured && data.candidates.length > 0 && (
            <div className="border-t border-gold/20 pt-4">
              <div className="flex items-start justify-between gap-4 mb-2">
                <p className="text-sm text-slate">
                  {data.candidates.length} current coaching{' '}
                  {data.candidates.length === 1 ? 'client doesn’t' : 'clients don’t'} have
                  library access yet.
                </p>
                <button type="button" onClick={grantAll} disabled={granting}
                  className="btn-spark text-xs px-3 py-1.5 shrink-0 disabled:opacity-50">
                  {granting ? 'Giving access…' : `Give access to ${data.candidates.length}`}
                </button>
              </div>
              <ul className="space-y-1">
                {data.candidates.map((c) => (
                  <li key={c.id} className="text-xs text-slate/70">
                    <Link href={`/clients/${c.id}`} className="hover:text-plum">
                      {c.name || c.email}
                    </Link>
                    {!c.memberstack_id && (
                      <span className="text-slate/50"> — no Memberstack account, will be skipped</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {note && <p className="text-sm text-forest mt-3">{note}</p>}
    </div>
  );
}
