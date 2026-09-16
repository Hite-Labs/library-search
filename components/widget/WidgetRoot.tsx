'use client';

import { useState, useEffect, useRef } from 'react';
import { SearchBox } from './SearchBox';
import { ResultsList } from './ResultsList';
import { DetailPanel } from './DetailPanel';
import { IdleContent } from './IdleContent';
import { bucketKey, readRecent, recordPlay } from '@/lib/widget/recently-played';
import type { GettingStarted, Result } from './types';

type State = 'idle' | 'searching' | 'results' | 'error';

/**
 * Report our height to embed.js, which sets the iframe's height from it.
 *
 * Measures our own root element, not `document.documentElement.scrollHeight`. The
 * document is the dashboard's root layout (see app/widget/layout.tsx), whose body
 * carries `min-h-full` — so scrollHeight could never report *less* than the iframe's
 * current height, which embed.js had just set from the previous measurement. The frame
 * could grow but never shrink, and closing a tall detail view would leave a gap.
 * An element's own box height has no such floor.
 */
function notifyHeight(el: HTMLElement | null) {
  if (typeof window === 'undefined' || !el) return;
  const height = Math.ceil(el.getBoundingClientRect().height);
  window.parent.postMessage({ type: 'resize', height }, '*');
}

export function WidgetRoot() {
  const [state, setState] = useState<State>('idle');
  const [query, setQuery] = useState('');
  // null = no prose summary for this search (skipped or failed); cards stand alone.
  const [response, setResponse] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [memberstackUserId, setMemberstackUserId] = useState<string | null>(null);
  const [memberToken, setMemberToken] = useState<string | null>(null);

  // The item whose player is open above the list. Deliberately NOT a member of `State`:
  // selection is orthogonal to the request lifecycle, and a 'detail' state would imply
  // the results are gone — they stay on screen underneath, which is the whole point.
  //
  // Holds the object, not an id, so the player's props keep a stable identity across
  // re-renders of the list and there's no find() that could come back undefined.
  const [selected, setSelected] = useState<Result | null>(null);

  // Lindsay's curated on-ramp, shown in the idle state. null means "not loaded, or the
  // fetch failed" — both render as no shelf, never as an error. Losing the shelf must not
  // cost a member the search box.
  const [gettingStarted, setGettingStarted] = useState<GettingStarted | null>(null);

  // What the idle shelf renders once the member has played something. Held in BOTH a ref
  // and state, on purpose — see handlePlayed for why the ref is the authoritative one.
  //
  // Seeded by a lazy initialiser rather than an effect: localStorage is synchronous, so the
  // shelf is correct on the FIRST paint with no second render and no height change. (This
  // is also why the storage choice was localStorage — a server-backed history could not be
  // read here.) The anonymous bucket is what's available pre-token; the member-scoped one
  // is picked up below once their id arrives.
  const [recent, setRecent] = useState<Result[]>(() => readRecent(bucketKey(null)));
  const recentRef = useRef<Result[]>(recent);

  const rootRef = useRef<HTMLDivElement>(null);

  // Is the idle shelf on screen right now? Read by the postMessage handler, which is
  // registered once with an empty dep array and would otherwise close over the state as it
  // was at mount. Kept in a ref rather than adding state to that effect's deps, because
  // re-registering the message listener on every state change is the kind of churn this
  // file's comments are otherwise careful to avoid.
  const canShowShelfRef = useRef(true);
  useEffect(() => {
    canShowShelfRef.current = state === 'idle' && !selected;
  });

  // Listen for the Memberstack user id + JWT from the parent page (forwarded by
  // embed.js). The token is what the backend actually verifies; the id is kept for
  // backward-compat/logging only.
  //
  // The origin check mirrors the frame-ancestors CSP in next.config.ts: only a page allowed
  // to frame us may hand us a token. Without it any page that embeds this widget could post
  // an arbitrary token in. The backend verifies the token regardless, so this is defence in
  // depth rather than the only control — but accepting credentials from an unchecked origin
  // is not a habit worth keeping.
  useEffect(() => {
    function isTrustedParent(origin: string): boolean {
      if (origin === window.location.origin) return true;
      try {
        const host = new URL(origin).hostname;
        return (
          host === 'showyourspark.com' ||
          host.endsWith('.showyourspark.com') ||
          host.endsWith('.webflow.io') ||
          host.endsWith('.webflow.com') ||
          host.endsWith('.webflow-ext.com')
        );
      } catch {
        return false;
      }
    }

    function onMessage(e: MessageEvent) {
      if (!isTrustedParent(e.origin)) return;
      if (e.data?.type === 'ms-user') {
        const userId: string | null = e.data.userId ?? null;
        setMemberstackUserId(userId);
        setMemberToken(e.data.token ?? null);

        // Switch to this member's own history bucket. Done here, in the handler for the
        // event that causes it, rather than in an effect watching the id — an effect would
        // be setState-during-render-cascade, the pattern React warns about.
        //
        // The ref is updated unconditionally so handlePlayed always appends to the right
        // list. The visible state is only touched when the shelf is actually on screen:
        // setStateRef below reads the CURRENT state via a ref, so a token arriving mid-track
        // can never re-render over a playing <audio> element.
        if (userId) {
          const mine = readRecent(bucketKey(userId));
          recentRef.current = mine;
          if (canShowShelfRef.current) setRecent(mine);
        }
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Fetch the curated shelf once, on mount.
  //
  // Deliberately NOT gated on the member token: embed.js delivers that on the iframe's
  // load event, after an async getCurrentMember(), so waiting for it would leave the idle
  // state blank at exactly the moment this content exists to fill. /api/getting-started is
  // public for that reason — see its header for why that's safe.
  //
  // No loading skeleton on purpose. A skeleton would change the root's height twice (empty
  // → skeleton → content) and each change is a postMessage that resizes the host iframe.
  // One grow is a settle; two is a flicker.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/getting-started')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: GettingStarted | null) => {
        if (!cancelled && data) setGettingStarted(data);
      })
      .catch(() => {
        // Swallowed: no shelf is a valid state, and search still works without it.
      });
    return () => {
      cancelled = true;
    };
  }, []);


  // Notify parent of height changes. Observing our own root rather than document.body
  // for the same reason notifyHeight measures it — see that function.
  //
  // `gettingStarted` is in the deps because the shelf lands asynchronously and grows the
  // root. The ResizeObserver would catch it regardless, but the immediate call keeps the
  // host iframe in step without waiting for the observer's first callback.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    notifyHeight(el);
    const observer = new ResizeObserver(() => notifyHeight(el));
    observer.observe(el);
    return () => observer.disconnect();
  }, [state, results, selected, gettingStarted, recent]);

  async function handleSearch() {
    if (!query.trim()) return;
    setState('searching');
    setErrorMsg('');
    // Drop the open player: it belongs to the previous set of results, and leaving it
    // above a fresh list would show an item that may not be in it.
    setSelected(null);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (memberToken) headers.Authorization = memberToken;
      const res = await fetch('/api/search', {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, memberstackUserId }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Throttled: the server's message is already member-facing copy, so show it as-is
        // rather than wrapping it in an Error (which would render "Error: ..." to the user).
        if (res.status === 429) {
          setErrorMsg(data.error ?? 'Too many searches. Please wait a moment.');
          setState('error');
          return;
        }
        throw new Error(data.error ?? 'Search failed');
      }
      setResponse(data.response ?? null);
      setResults(data.results);
      setState('results');
    } catch (err) {
      setErrorMsg(String(err));
      setState('error');
    }
  }

  /**
   * Record that the member started playing something.
   *
   * Writes to localStorage and to a REF — deliberately not to state. Calling setRecent here
   * would re-render WidgetRoot while audio is playing, which is the exact class of thing
   * Player's header comment warns about: React reconciles by position, and a re-render that
   * shifted a sibling could unmount the <audio> element mid-track.
   *
   * Nothing is lost by waiting. The recently-played shelf is not on screen at the moment of
   * play — the member is looking at the player. It only has to be correct the next time the
   * idle state renders, which is handleReset below.
   */
  function handlePlayed(item: Result) {
    recentRef.current = recordPlay(bucketKey(memberstackUserId), item);
  }

  function handleReset() {
    setState('idle');
    setQuery('');
    setResponse(null);
    setResults([]);
    setErrorMsg('');
    setSelected(null);
    // The one moment the shelf becomes visible again, so the one moment it needs to catch
    // up with whatever handlePlayed recorded while the player was open.
    setRecent(recentRef.current);
  }

  return (
    <div ref={rootRef} className="p-4 space-y-4 font-sans">
      {/*
        The heading names whatever is on screen, so it lives here rather than in Webflow.
        The iframe is a sealed box: the host page cannot see this widget's state, so a
        Webflow-authored H1 would still read "Audio Membership" while a track was playing.
        Derived from `selected` — no extra state to keep in sync.
      */}
      {selected && (
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="text-xs tint-petal-70 hover:text-gold transition-colors"
        >
          &lsaquo; Back to results
        </button>
      )}
      <h1 className="font-serif text-2xl text-petal leading-snug">
        {selected ? selected.title : 'Audio Membership'}
      </h1>

      {/*
        The search box is hidden while something is playing. Choosing is finished at that
        point, and leaving the box up invited someone to start a new search over the top of
        the track they had just settled on. "Back to results" above returns it.
      */}
      {!selected && (
        <SearchBox
          query={query}
          onChange={setQuery}
          onSubmit={handleSearch}
          disabled={state === 'searching'}
        />
      )}

      {/*
        The idle shelf. Structured to mirror the `results` block below it, and for the same
        reason: DetailPanel is rendered unconditionally (it returns null when nothing is
        selected) so its position among its siblings never changes. React reconciles by
        position, and a panel that appeared and disappeared would shift the index of the
        list beneath it — which can unmount a playing <audio> element.
      */}
      {state === 'idle' && (
        <div className="space-y-4">
          <DetailPanel
            item={selected}
            onClose={() => setSelected(null)}
            onFirstPlay={() => selected && handlePlayed(selected)}
          />
          <div className={selected ? 'pt-6' : undefined}>
            <IdleContent
              gettingStarted={gettingStarted}
              recent={recent}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
            />
          </div>
        </div>
      )}

      {state === 'searching' && (
        <div className="flex items-center gap-2 text-sm tint-petal-80">
          <div className="w-4 h-4 border-2 tint-border-petal-30 border-t-gold rounded-full animate-spin shrink-0" />
          Looking through the library…
        </div>
      )}

      {state === 'results' && (
        <div className="space-y-4">
          {/*
            Rendered unconditionally, with the emptiness handled inside, so the panel
            keeps a fixed position among its siblings. React reconciles by position:
            toggling this subtree in and out would shift ResultsList's index and could
            unmount the <audio> element mid-playback.
          */}
          <DetailPanel
            item={selected}
            onClose={() => setSelected(null)}
            onFirstPlay={() => selected && handlePlayed(selected)}
          />
          {/*
            Breathing room between the open player and the alternatives below it. Without
            it "Other results" reads as part of the player card rather than a new section.
          */}
          <div className={selected ? 'pt-6' : undefined}>
            <ResultsList
              response={response}
              results={results}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
              demoted={!!selected}
            />
          </div>
          {!selected && (
            <button
              type="button"
              onClick={handleReset}
              className="text-xs tint-petal-70 hover:text-gold underline underline-offset-2 transition-colors"
            >
              Search again
            </button>
          )}
        </div>
      )}

      {state === 'error' && (
        <div className="bg-petal border tint-border-scarlet-30 rounded-xl p-3 text-sm text-scarlet">
          <p className="font-medium">Something went wrong</p>
          <p className="text-xs mt-1 tint-forest-70">{errorMsg}</p>
          <button
            type="button"
            onClick={handleReset}
            className="mt-2 text-xs text-forest underline underline-offset-2 hover:text-plum"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
