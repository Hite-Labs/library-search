'use client';

import { useEffect, useRef } from 'react';

interface MediaPlayerProps {
  mediaType: string;
  url: string;
  title: string;
}

/**
 * Sample player for the library detail panel. Ports the branching and teardown
 * behaviour of the portal's vanilla media modal (public/portal.js) — the repo has
 * no React player to reuse.
 *
 * The "previous item keeps playing after you select a new one" bug is closed three
 * ways over: the detail panel is keyed on item id by its parent, the media element
 * is keyed on url here, and the effect below pauses and clears the source on
 * teardown. That redundancy is deliberate — it's the most noticeable defect a
 * master-detail media browser can ship with.
 */
export function MediaPlayer({ mediaType, url, title }: MediaPlayerProps) {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);

  useEffect(() => {
    const el = ref.current;
    return () => {
      if (el) {
        el.pause();
        el.removeAttribute('src');
        el.load();
      }
    };
  }, [url]);

  // PDFs get no inline player, matching the portal (which opens them in a new tab).
  if (mediaType === 'pdf') {
    return (
      <div className="flex items-center gap-3">
        <a href={url} target="_blank" rel="noopener noreferrer" className="btn-spark-outline">
          Open PDF
        </a>
        <DownloadLink url={url} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {mediaType === 'video' ? (
        <video
          key={url}
          ref={ref}
          src={url}
          controls
          // Never 'auto': that would pull megabytes from R2 on every selection change.
          preload="metadata"
          className="w-full max-h-80 rounded-lg bg-black"
        >
          <track kind="captions" label={title} />
        </video>
      ) : (
        <audio key={url} ref={ref} src={url} controls preload="metadata" className="w-full">
          <track kind="captions" label={title} />
        </audio>
      )}
      <DownloadLink url={url} />
    </div>
  );
}

function DownloadLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      download
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block text-xs text-slate/60 hover:text-slate underline underline-offset-2"
    >
      Download
    </a>
  );
}
