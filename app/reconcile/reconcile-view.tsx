'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Nav } from '@/components/Nav';

interface Issue {
  kind: 'missing-plan' | 'extra-plan' | 'not-provisioned' | 'no-program' | 'orphan-member';
  planType: 'individual' | 'cohort' | null;
  email: string;
  name: string | null;
  clientId: string | null;
  memberstackId: string | null;
  detail: string;
}

interface ReconcileData {
  ok: boolean;
  checkedClients: number;
  checkedMembers: number;
  /** Clients whose missing memberstack_id was repaired during this check. */
  backfilled: number;
  issues: Issue[];
  error?: string;
}

// Each kind gets a heading and a plain-language explanation of what the operator is
// looking at — this page is read rarely, so it shouldn't assume recall.
const GROUPS: { kind: Issue['kind']; title: string; blurb: string }[] = [
  {
    kind: 'missing-plan',
    title: 'Missing access',
    blurb: 'Enrolled in the dashboard but the matching plan is not active in Memberstack. These people are locked out of a tab they should see.',
  },
  {
    kind: 'extra-plan',
    title: 'Access they should not have',
    blurb: 'Holds a plan in Memberstack with no matching active enrollment. They see an empty panel — this is what happens after removing someone from a cohort.',
  },
  {
    kind: 'not-provisioned',
    title: 'Never provisioned',
    blurb: 'Has an active enrollment but no Memberstack member at all. They cannot log into the portal. Fix by re-adding them through the dashboard, which provisions on the way in.',
  },
  {
    kind: 'orphan-member',
    title: 'Unknown members',
    blurb: 'Has a coaching plan in Memberstack but no client record here. Usually someone added directly in Memberstack, or a client deleted from the dashboard.',
  },
  {
    kind: 'no-program',
    title: 'Not in a program',
    blurb: 'Exists here but has no active enrollment and no Memberstack account, so they cannot log in. Expected for a lead or someone whose program has ended — worth a look if you thought they were enrolled.',
  },
];

function issueKey(i: Issue): string {
  return `${i.kind}:${i.email}:${i.planType ?? ''}`;
}

export function ReconcileView() {
  const [data, setData] = useState<ReconcileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/reconcile');
      const d = await res.json();
      if (!d.ok) throw new Error(d.error ?? 'Failed to run reconciliation');
      setData(d);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Fixes are applied one at a time, each behind a confirm: every one of these changes
  // what a real person can see when they log in.
  async function fix(issue: Issue) {
    if (!issue.memberstackId || !issue.planType) return;
    const attaching = issue.kind === 'missing-plan';
    const who = issue.name || issue.email;
    const verb = attaching ? 'Grant' : 'Remove';
    if (!window.confirm(
      `${verb} the ${issue.planType} plan ${attaching ? 'to' : 'from'} ${who}?\n\nThis changes what they see in the portal immediately.`,
    )) return;

    setBusyKey(issueKey(issue)); setError(null);
    try {
      const res = await fetch('/api/reconcile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberstackId: issue.memberstackId,
          planType: issue.planType,
          action: attaching ? 'attach' : 'detach',
        }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error ?? 'Failed to apply fix');
      await load();
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="min-h-screen bg-petal/40">
      <Nav />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-start justify-between mb-2">
          <h1 className="text-xl font-serif text-slate">Access check</h1>
          <button onClick={load} disabled={loading}
            className="btn-spark-outline text-xs px-3 py-1.5 disabled:opacity-50">
            {loading ? 'Checking…' : 'Re-check'}
          </button>
        </div>
        <p className="text-sm text-slate/70 mb-6">
          Compares this dashboard against Memberstack. The dashboard is the source of truth —
          anything listed here means the two disagree about what someone can see in the portal.
        </p>

        {error && (
          <div className="bg-white rounded-2xl border border-red-200 p-4 mb-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {loading && !data && (
          <p className="text-sm text-slate/60">Reading clients and Memberstack members…</p>
        )}

        {data && (
          <>
            <p className="font-label text-xs text-slate/60 mb-4">
              Checked {data.checkedClients} clients against {data.checkedMembers} Memberstack members.
              {/* A silent write on a page the operator trusts should say so out loud. */}
              {data.backfilled > 0 && (
                <>
                  {' '}Linked {data.backfilled}{' '}
                  {data.backfilled === 1 ? 'client' : 'clients'} to their existing Memberstack
                  account — their portal was broken until now.
                </>
              )}
            </p>

            {/* 'no-program' is a standing fact, not a disagreement between the two systems,
                so it's listed below but must not withhold the all-clear on its own. The
                wording has to stay true alongside that list — claiming "everything matches"
                directly above people who cannot log in reads as a broken check. */}
            {!data.issues.some((i) => i.kind !== 'no-program') && (
              <div className="bg-white rounded-2xl border border-gold/20 p-6 mb-4">
                <p className="text-sm text-slate">
                  No drift — every client with a program has portal access matching their
                  enrollments.
                </p>
              </div>
            )}

            {data.issues.length > 0 && (
              <div className="space-y-4">
                {GROUPS.map((g) => {
                  const rows = data.issues.filter((i) => i.kind === g.kind);
                  if (rows.length === 0) return null;
                  return (
                    <div key={g.kind} className="bg-white rounded-2xl border border-gold/20 p-6">
                      <h2 className="font-label text-xs text-plum mb-1">
                        {g.title} ({rows.length})
                      </h2>
                      <p className="text-xs text-slate/60 mb-3">{g.blurb}</p>
                      <div className="space-y-2">
                        {rows.map((i) => {
                          const key = issueKey(i);
                          const fixable = Boolean(i.memberstackId && i.planType);
                          return (
                            <div key={key}
                              className="flex items-center justify-between gap-3 border border-gold/20 rounded-lg p-3">
                              <div className="min-w-0">
                                <p className="text-sm text-slate truncate">
                                  {i.clientId ? (
                                    <Link href={`/clients/${i.clientId}`} className="hover:text-plum">
                                      {i.name || i.email}
                                    </Link>
                                  ) : (
                                    i.name || i.email
                                  )}
                                  {i.planType && (
                                    <span className="ml-2 font-label text-[10px] uppercase text-slate/50">
                                      {i.planType}
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-slate/60 truncate">{i.email}</p>
                              </div>
                              {fixable && (
                                <button
                                  type="button"
                                  onClick={() => fix(i)}
                                  disabled={busyKey === key}
                                  className="btn-spark-outline text-xs px-3 py-1.5 shrink-0 disabled:opacity-50"
                                >
                                  {busyKey === key
                                    ? 'Working…'
                                    : i.kind === 'missing-plan' ? 'Grant plan' : 'Remove plan'}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
