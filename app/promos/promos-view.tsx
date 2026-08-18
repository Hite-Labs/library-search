'use client';

import { useState, useEffect, useCallback } from 'react';
import { Nav } from '@/components/Nav';
import { PromoForm } from './promo-form';
import { PLAN_KEYS } from '@/lib/plan-keys';

export interface Promo {
  id: string;
  title: string;
  body: string;
  cta_label: string;
  cta_url: string;
  requires_missing_plan: string | null;
  kind: 'buy' | 'inclusion';
  active: boolean;
  sort_order: number;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

function isKnownPlan(key: string): boolean {
  return (PLAN_KEYS as readonly string[]).includes(key);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Why a promo is or is not showing right now.
 *
 * This mirrors listLivePromos' SQL (lib/db.ts) deliberately. The single question this
 * page has to answer is "why can't I see my promo?", and making the operator work that
 * out from three separate columns is how the question turns into a support message.
 *
 * Plan targeting is NOT folded in here: it varies per member, so there is no one true
 * answer, and pretending otherwise would make this verdict wrong. It is shown alongside.
 */
function liveStatus(p: Promo, now: Date): { live: boolean; reason: string } {
  if (!p.active) return { live: false, reason: 'Paused' };
  if (p.starts_at && new Date(p.starts_at) > now) {
    return { live: false, reason: 'Starts ' + formatDate(p.starts_at) };
  }
  // Matches the SQL's `ends_at > now()` — at the stroke of ends_at the promo is over.
  if (p.ends_at && new Date(p.ends_at) <= now) {
    return { live: false, reason: 'Ended ' + formatDate(p.ends_at) };
  }
  return { live: true, reason: 'Showing now' };
}

/** Who sees this promo, in the operator's terms rather than the column's. */
function audienceLabel(requiresMissingPlan: string | null): string {
  if (!requiresMissingPlan) return 'Everyone';
  if (!isKnownPlan(requiresMissingPlan)) {
    // An unrecognised key cannot match a held plan, so the promo shows to everyone.
    // Surfacing that matters: silently advertising the cohort to people who already
    // paid for it is the exact mistake this column exists to prevent.
    return 'Everyone — "' + requiresMissingPlan + '" is not a known plan';
  }
  return 'Members without ' + requiresMissingPlan;
}

export function PromosView() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Promo | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/promos');
    const data = await res.json();
    return (data.promos ?? []) as Promo[];
  }, []);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((rows) => {
        if (!cancelled) setPromos(rows);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load promos.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const refresh = useCallback(async () => {
    try {
      setPromos(await load());
    } catch {
      setError('Saved, but the list could not be refreshed. Reload the page.');
    }
  }, [load]);

  // Pausing is the safe way to retire an offer, so it is one click with no confirm.
  // It is also reversible, which is the whole reason to prefer it over deleting.
  const togglePaused = useCallback(
    async (p: Promo) => {
      setBusyId(p.id);
      setError(null);
      try {
        const res = await fetch('/api/promos/' + p.id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active: !p.active }),
        });
        if (!res.ok) throw new Error('patch failed');
        await refresh();
      } catch {
        setError('Could not update that promo.');
      } finally {
        setBusyId(null);
      }
    },
    [refresh],
  );

  const remove = useCallback(
    async (p: Promo) => {
      const ok = confirm(
        'Delete "' +
          p.title +
          '" permanently?\n\nIf you might use it again, choose Pause instead — that hides it from members but keeps it here.',
      );
      if (!ok) return;
      setBusyId(p.id);
      setError(null);
      try {
        const res = await fetch('/api/promos/' + p.id, { method: 'DELETE' });
        if (!res.ok) throw new Error('delete failed');
        await refresh();
      } catch {
        setError('Could not delete that promo.');
      } finally {
        setBusyId(null);
      }
    },
    [refresh],
  );

  const now = new Date();
  const liveCount = promos.filter((p) => liveStatus(p, now).live).length;

  return (
    <div className="min-h-screen bg-petal/40">
      <Nav />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-serif text-slate">Promos</h1>
            <p className="text-sm text-slate/60 mt-0.5">
              Offers shown inside the member portal
              {!loading &&
                promos.length > 0 &&
                ' — ' + liveCount + ' showing now, ' + promos.length + ' total'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setEditing(null);
            }}
            className="shrink-0 bg-plum text-gold font-label text-sm px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
          >
            New promo
          </button>
        </div>

        <p className="text-sm text-slate/60 mb-5 max-w-2xl">
          A promo is hidden from anyone who already has the plan it advertises, so a cohort
          offer disappears the moment someone joins. Members with no plans yet see everything.
        </p>

        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {(creating || editing) && (
          <PromoForm
            promo={editing}
            onCancel={() => {
              setCreating(false);
              setEditing(null);
            }}
            onSaved={async () => {
              setCreating(false);
              setEditing(null);
              await refresh();
            }}
          />
        )}

        {loading ? (
          <div className="py-16 flex justify-center">
            <div className="w-6 h-6 border-2 border-slate/20 border-t-plum rounded-full animate-spin" />
          </div>
        ) : promos.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-slate/20 rounded-xl bg-white/50">
            <p className="text-slate/70 text-sm">No promos yet.</p>
            <p className="text-slate/50 text-sm mt-1">
              Create one to start offering the cohort or coaching inside the portal.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {promos.map((p) => {
              const status = liveStatus(p, now);
              const busy = busyId === p.id;
              const unknownPlan =
                p.requires_missing_plan !== null && !isKnownPlan(p.requires_missing_plan);
              return (
                <div
                  key={p.id}
                  className={
                    'bg-white border rounded-xl px-4 py-3 transition-opacity ' +
                    (busy ? 'opacity-50 ' : '') +
                    (status.live ? 'border-slate/15' : 'border-slate/10 bg-white/60')
                  }
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={
                            'inline-block w-1.5 h-1.5 rounded-full shrink-0 ' +
                            (status.live ? 'bg-emerald-500' : 'bg-slate/30')
                          }
                          aria-hidden
                        />
                        <h2
                          className={
                            'font-serif truncate ' +
                            (status.live ? 'text-slate' : 'text-slate/50')
                          }
                        >
                          {p.title}
                        </h2>
                        {p.kind === 'inclusion' && (
                          <span className="font-label text-[0.65rem] uppercase tracking-wide text-plum bg-petal px-1.5 py-0.5 rounded">
                            Included
                          </span>
                        )}
                      </div>

                      {p.body && (
                        <p className="text-sm text-slate/60 mt-1 line-clamp-2">{p.body}</p>
                      )}

                      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-2 font-label text-xs text-slate/50">
                        <span className={status.live ? 'text-emerald-700' : ''}>
                          {status.reason}
                        </span>
                        <span aria-hidden>·</span>
                        <span className={unknownPlan ? 'text-amber-700' : ''}>
                          {audienceLabel(p.requires_missing_plan)}
                        </span>
                        {p.cta_label && (
                          <>
                            <span aria-hidden>·</span>
                            <span className="truncate max-w-[16rem]">Button: {p.cta_label}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setEditing(p);
                          setCreating(false);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="font-label text-xs text-plum hover:text-slate px-2 py-1 transition-colors disabled:opacity-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => togglePaused(p)}
                        className="font-label text-xs text-slate/60 hover:text-slate px-2 py-1 transition-colors disabled:opacity-50"
                      >
                        {p.active ? 'Pause' : 'Resume'}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => remove(p)}
                        className="font-label text-xs text-slate/40 hover:text-red-600 px-2 py-1 transition-colors disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
