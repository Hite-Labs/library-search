'use client';

import { useState, useEffect } from 'react';
import { SearchBox } from './SearchBox';
import { ResultsList } from './ResultsList';

type State = 'idle' | 'searching' | 'results' | 'error';

interface Result {
  id: string;
  title: string;
  description: string;
  mediaType: string;
  contentPageUrl: string | null;
  similarity: number;
}

function notifyHeight() {
  if (typeof window === 'undefined') return;
  const height = document.documentElement.scrollHeight;
  window.parent.postMessage({ type: 'resize', height }, '*');
}

export function WidgetRoot() {
  const [state, setState] = useState<State>('idle');
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [memberstackUserId, setMemberstackUserId] = useState<string | null>(null);

  // Listen for Memberstack user ID from parent page
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === 'ms-user') {
        setMemberstackUserId(e.data.userId ?? null);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Notify parent of height changes
  useEffect(() => {
    notifyHeight();
    const observer = new ResizeObserver(notifyHeight);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, [state, results]);

  async function handleSearch() {
    if (!query.trim()) return;
    setState('searching');
    setErrorMsg('');

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, memberstackUserId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Search failed');
      setResponse(data.response);
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
    setResponse('');
    setResults([]);
    setErrorMsg('');
  }

  return (
    <div className="p-4 space-y-4 font-sans">
      <SearchBox
        query={query}
        onChange={setQuery}
        onSubmit={handleSearch}
        disabled={state === 'searching'}
      />

      {state === 'searching' && (
        <div className="flex items-center gap-2 text-sm text-stone-500">
          <div className="w-4 h-4 border-2 border-stone-200 border-t-stone-500 rounded-full animate-spin shrink-0" />
          Looking through the library…
        </div>
      )}

      {state === 'results' && (
        <div className="space-y-4">
          <ResultsList response={response} results={results} />
          <button
            type="button"
            onClick={handleReset}
            className="text-xs text-stone-400 hover:text-stone-600 underline underline-offset-2"
          >
            Search again
          </button>
        </div>
      )}

      {state === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          <p className="font-medium">Something went wrong</p>
          <p className="text-xs mt-1 text-red-500">{errorMsg}</p>
          <button
            type="button"
            onClick={handleReset}
            className="mt-2 text-xs underline"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
