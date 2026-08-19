'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The member-facing player.
 *
 * Deliberately NOT components/MediaPlayer.tsx. That one is the admin library panel's
 * player, and its teardown effect pauses, clears `src` and calls load() on unmount,
 * plus it keys the element on url. Both are right for a master-detail admin browser
 * and fatal here: this player has to keep audio alive while the results list beneath
 * it re-renders, and while the phone is locked.
 *
 * Three rules follow from that, and they are the whole design:
 *
 *   1. ONE media element whose `src` attribute changes. Never `key={src}` — that
 *      destroys and recreates the element, which stops playback.
 *   2. Nothing is paused or unloaded on unmount. Only listeners and the media session
 *      are cleaned up.
 *   3. All transport state is read from the element's own events, never from a local
 *      boolean we toggle. The lock screen can start and stop playback without going
 *      through our buttons, so anything else desyncs on the first lock-screen tap.
 */

const SKIP_SECONDS = 15;
const SPEEDS = [0.75, 1, 1.25, 1.5] as const;

interface PlayerProps {
  src: string;
  mediaType: string;
  title: string;
  /** A hint only — null for almost every row. The file is the source of truth. */
  durationSeconds: number | null;
}

/**
 * MediaSession isn't in this TypeScript lib version. Typed locally rather than pulled
 * in as a dependency, following the ISpeechRecognition precedent in VoiceInput.tsx.
 */
interface MediaSessionLike {
  metadata: unknown;
  playbackState: 'none' | 'paused' | 'playing';
  setActionHandler(action: string, handler: ((details: MediaSessionDetails) => void) | null): void;
  setPositionState?(state: { duration: number; playbackRate: number; position: number }): void;
}
interface MediaSessionDetails {
  seekTime?: number;
  seekOffset?: number;
  fastSeek?: boolean;
}

function mediaSession(): MediaSessionLike | null {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return null;
  return (navigator as unknown as { mediaSession: MediaSessionLike }).mediaSession;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function Player({ src, mediaType, title, durationSeconds }: PlayerProps) {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [speed, setSpeed] = useState(1);
  // Seeded from the column, then replaced by the file's real duration. The column is
  // null for 14 of 15 rows, so treat a finite value here as the exception.
  const [duration, setDuration] = useState<number | null>(
    durationSeconds && Number.isFinite(durationSeconds) ? durationSeconds : null,
  );
  // True while the user drags the scrubber, so timeupdate doesn't fight their thumb.
  const scrubbing = useRef(false);

  const isVideo = mediaType === 'video';

  // ---- transport, driven by the element ------------------------------------------

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => {
      if (!scrubbing.current) setCurrent(el.currentTime);
    };
    const onMeta = () => {
      // Streams report Infinity; a failed load reports NaN. Either means "no scrubber".
      setDuration(Number.isFinite(el.duration) ? el.duration : null);
    };
    const onRate = () => setSpeed(el.playbackRate);
    const onEnded = () => setPlaying(false);

    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('ratechange', onRate);
    el.addEventListener('ended', onEnded);
    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('ratechange', onRate);
      el.removeEventListener('ended', onEnded);
      // Note: no pause(), no removeAttribute('src'), no load(). See the header comment.
    };
  }, []);

  // No effect resets the transport when the item changes: DetailPanel keys this
  // component on the item id, so a different item mounts a fresh Player with fresh
  // state. (Keying the *component* is fine and desirable; keying the media element on
  // src inside it is what would break playback.)

  const seekTo = useCallback((time: number) => {
    const el = ref.current;
    if (!el) return;
    const max = Number.isFinite(el.duration) ? el.duration : Infinity;
    el.currentTime = Math.min(Math.max(time, 0), max);
    setCurrent(el.currentTime);
  }, []);

  const toggle = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // play() rejects if the browser blocks it (no gesture, or another app holds audio
    // focus). Swallow it: the pause event keeps our UI honest either way.
    if (el.paused) void el.play().catch(() => {});
    else el.pause();
  }, []);

  // ---- lock screen ----------------------------------------------------------------

  // Metadata + handlers. Set from inside this frame, which is the supported
  // configuration: media session calls only affect the OS notification when they come
  // from the same frame as the media element, and both live in this iframe document.
  useEffect(() => {
    const ms = mediaSession();
    const el = ref.current;
    if (!ms || !el) return;

    const MM = (window as unknown as { MediaMetadata?: new (init: object) => unknown }).MediaMetadata;
    if (MM) {
      ms.metadata = new MM({
        title,
        artist: 'Show Your Spark',
        // Without artwork the lock screen shows a blank tile.
        artwork: [{ src: '/sys-mark.png', sizes: '512x512', type: 'image/png' }],
      });
    }

    const handlers: Array<[string, (d: MediaSessionDetails) => void]> = [
      ['play', () => void el.play().catch(() => {})],
      ['pause', () => el.pause()],
      ['seekbackward', (d) => seekTo(el.currentTime - (d.seekOffset ?? SKIP_SECONDS))],
      ['seekforward', (d) => seekTo(el.currentTime + (d.seekOffset ?? SKIP_SECONDS))],
      [
        'seekto',
        (d) => {
          if (typeof d.seekTime !== 'number') return;
          if (d.fastSeek && typeof el.fastSeek === 'function') el.fastSeek(d.seekTime);
          else seekTo(d.seekTime);
        },
      ],
    ];

    // Not registering nexttrack/previoustrack is deliberate: there's no playlist, and
    // leaving them unset makes the OS hide those buttons rather than show dead ones.
    for (const [action, fn] of handlers) {
      try {
        ms.setActionHandler(action, fn);
      } catch {
        // Older browsers throw on unknown actions rather than ignoring them.
      }
    }

    return () => {
      for (const [action] of handlers) {
        try {
          ms.setActionHandler(action, null);
        } catch {
          /* same */
        }
      }
    };
  }, [src, title, seekTo]);

  useEffect(() => {
    const ms = mediaSession();
    if (ms) ms.playbackState = playing ? 'playing' : 'paused';
  }, [playing]);

  // Position, so the lock screen's scrubber tracks. Guarded on a finite duration:
  // setPositionState throws a TypeError on NaN/Infinity, which is the default state
  // for our null-duration rows and would otherwise take out the whole effect.
  useEffect(() => {
    const ms = mediaSession();
    if (!ms?.setPositionState || duration === null || !Number.isFinite(duration)) return;
    try {
      ms.setPositionState({
        duration,
        playbackRate: speed,
        position: Math.min(current, duration),
      });
    } catch {
      // Some browsers are stricter than the spec about position <= duration.
    }
    // `current` ticks ~4x/sec; this effect is cheap and the browser throttles the
    // notification itself, so we don't add another layer of throttling here.
  }, [current, duration, speed]);

  // ---- render ---------------------------------------------------------------------

  if (mediaType === 'pdf') {
    return (
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-sm font-medium text-stone-700 underline underline-offset-2"
      >
        Open document ↗
      </a>
    );
  }

  const canScrub = duration !== null;

  return (
    <div className="space-y-3">
      {isVideo ? (
        <video
          ref={ref}
          src={src}
          // Without playsInline iOS takes the video fullscreen in its own chrome and
          // our controls never appear.
          playsInline
          preload="metadata"
          className="w-full max-h-80 rounded-xl bg-black"
        />
      ) : (
        // Present but never shown: all transport is ours. Kept in the DOM (rather than
        // constructed in JS) so React owns its lifecycle and src updates declaratively.
        <audio ref={ref} src={src} preload="metadata" className="hidden" />
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? 'Pause' : 'Play'}
          className="w-11 h-11 shrink-0 rounded-full bg-stone-800 text-white flex items-center justify-center hover:bg-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:ring-offset-2"
        >
          {playing ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <rect x="3" y="2" width="4" height="12" rx="1" />
              <rect x="9" y="2" width="4" height="12" rx="1" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M4 2.5v11a.5.5 0 0 0 .76.43l9-5.5a.5.5 0 0 0 0-.86l-9-5.5A.5.5 0 0 0 4 2.5Z" />
            </svg>
          )}
        </button>

        <button
          type="button"
          onClick={() => seekTo(current - SKIP_SECONDS)}
          className="text-xs text-stone-500 hover:text-stone-800 tabular-nums"
          aria-label={`Back ${SKIP_SECONDS} seconds`}
        >
          −{SKIP_SECONDS}s
        </button>
        <button
          type="button"
          onClick={() => seekTo(current + SKIP_SECONDS)}
          className="text-xs text-stone-500 hover:text-stone-800 tabular-nums"
          aria-label={`Forward ${SKIP_SECONDS} seconds`}
        >
          +{SKIP_SECONDS}s
        </button>

        {!isVideo && (
          <button
            type="button"
            onClick={() => {
              const el = ref.current;
              if (!el) return;
              const next = SPEEDS[(SPEEDS.indexOf(speed as (typeof SPEEDS)[number]) + 1) % SPEEDS.length];
              el.playbackRate = next;
            }}
            className="ml-auto text-xs text-stone-500 hover:text-stone-800 tabular-nums"
            aria-label="Playback speed"
          >
            {speed}×
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs text-stone-400 tabular-nums w-10 shrink-0">{formatTime(current)}</span>
        <input
          type="range"
          min={0}
          max={canScrub ? duration : 1}
          step="any"
          value={current}
          disabled={!canScrub}
          onPointerDown={() => (scrubbing.current = true)}
          onPointerUp={() => (scrubbing.current = false)}
          onChange={(e) => {
            const t = Number(e.target.value);
            setCurrent(t);
            seekTo(t);
          }}
          // A scrubber with no known length would be a lie, so it stays disabled until
          // loadedmetadata lands. Elapsed time still ticks.
          aria-label="Seek"
          className="flex-1 accent-stone-800 disabled:opacity-30"
        />
        <span className="text-xs text-stone-400 tabular-nums w-10 shrink-0 text-right">
          {canScrub ? formatTime(duration) : '--:--'}
        </span>
      </div>
    </div>
  );
}
