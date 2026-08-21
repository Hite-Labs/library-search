'use client';

import { useState, useEffect, useRef } from 'react';
import { SearchBox } from './SearchBox';
import { ResultsList } from './ResultsList';
import { DetailPanel } from './DetailPanel';
import type { Result } from './types';

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

  const rootRef = useRef<HTMLDivElement>(null);

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
        setMemberstackUserId(e.data.userId ?? null);
        setMemberToken(e.data.token ?? null);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Notify parent of height changes. Observing our own root rather than document.body
  // for the same reason notifyHeight measures it — see that function.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    notifyHeight(el);
    const observer = new ResizeObserver(() => notifyHeight(el));
    observer.observe(el);
    return () => observer.disconnect();
  }, [state, results, selected]);

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

  function handleReset() {
    setState('idle');
    setQuery('');
    setResponse(null);
    setResults([]);
    setErrorMsg('');
    setSelected(null);
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
          <DetailPanel item={selected} onClose={() => setSelected(null)} />
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
