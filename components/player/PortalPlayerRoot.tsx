'use client';

import { useEffect, useRef, useState } from 'react';
import { Player } from '@/components/widget/Player';
import { isTrustedParent } from '@/lib/widget/trusted-origins';

/**
 * The coaching portal's player, living in its own iframe.
 *
 * WHY A FRAME, when the portal is otherwise a script that writes into Webflow's own DOM:
 * media session calls only reach the OS notification when they come from the SAME frame as
 * the media element. Background playback — screen locked, phone in a pocket, a member
 * asleep — is the entire point of these recordings, and it is a frame-ownership problem
 * rather than a styling one.
 *
 * It also means the hard part is already written. components/widget/Player.tsx is reused
 * UNMODIFIED, including its colours: this renders on a petal sheet, which is the surface its
 * plum button and forest timestamps were designed for. (They were briefly put on a dark
 * forest bar, where the timestamps were forest-on-forest and effectively invisible. The
 * sheet fixes that by being the right background rather than by restyling the player.)
 *
 * ONE SURFACE. There is no minimised state and no second chrome to switch between. An
 * earlier version opened in the host's dialog and "closed" into a bottom bar, which meant a
 * button marked close did not close — it moved. Now the sheet is the only thing, and its X
 * closes and stops, which is what the word means.
 *
 * The conversation with the host page:
 *
 *   in   { type: 'play-item', id, src, title, mediaType, downloadUrl }   load this, paused
 *   in   { type: 'stop' }                                    the host asked us to stop
 *   out  { type: 'player-ready' }                            I am listening; flush your queue
 *   out  { type: 'resize', height }                          size my frame to fit
 *   out  { type: 'close' }                                   member pressed X; take me away
 *   out  { type: 'player-state', playing, id, title }        what is playing, for the host
 *
 * Nothing here pauses or unloads except on an explicit stop or close. The host dimming or
 * revealing its backdrop is a CSS change on a SIBLING of our frame, never an ancestor —
 * anything that toggled display on a parent would unload the media element and stop the
 * audio, which is the failure this whole design exists to avoid.
 */

interface PlayItem {
  id: string;
  src: string;
  title: string;
  mediaType: string;
  downloadUrl: string | null;
}

function post(message: Record<string, unknown>) {
  if (typeof window === 'undefined' || window.parent === window) return;
  // '*' rather than a pinned origin, matching WidgetRoot's resize message. These carry no
  // credentials — a height, and what is playing — and the host is whichever page framed us,
  // which we cannot name here without hardcoding it a fourth time.
  window.parent.postMessage(message, '*');
}

export function PortalPlayerRoot() {
  const [item, setItem] = useState<PlayItem | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Inbound messages. Registered once, empty deps — the same discipline Player's transport
  // effect keeps, for the same reason: re-registering listeners mid-playback is churn this
  // code cannot afford.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!isTrustedParent(e.origin)) return;
      const data = e.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'play-item') {
        const { id, src, title, mediaType, downloadUrl } = data as Partial<PlayItem>;
        // A message missing any of these would mount a Player pointed at nothing, so it is
        // dropped rather than rendered as a broken transport.
        if (!id || !src || !mediaType) return;
        setItem({
          id,
          src,
          title: title ?? '',
          mediaType,
          downloadUrl: downloadUrl ?? null,
        });
      } else if (data.type === 'stop') {
        // Unmounting the Player detaches the element, which stops it. The member asked, so
        // this is the one time that is right.
        setItem(null);
      }
    }

    window.addEventListener('message', onMessage);
    // Tell the host we are listening. The first card click will usually beat this frame's
    // load, so portal.js queues that message and flushes it when this arrives.
    post({ type: 'player-ready' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Report our height so the host can size the frame. Measures our own box rather than the
  // document, which carries a min-height that would stop the frame ever shrinking back.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const notify = () =>
      post({ type: 'resize', height: Math.ceil(el.getBoundingClientRect().height) });
    notify();
    const observer = new ResizeObserver(notify);
    observer.observe(el);
    return () => observer.disconnect();
  }, [item]);

  function close() {
    setItem(null);
    post({ type: 'close' });
  }

  return (
    <div ref={rootRef} className="px-4 pt-3 pb-4 font-sans">
      {item && (
        <>
          {/*
            Title, download and close in one row above the transport. The download link used
            to live in the host's dialog; with the dialog gone it belongs here, next to the
            thing it downloads, rather than needing a block built in Webflow.
          */}
          <div className="flex items-start gap-3 pb-2">
            <h2 className="flex-1 min-w-0 text-sm font-semibold text-forest leading-snug">
              {item.title}
            </h2>
            {item.downloadUrl && (
              <a
                href={item.downloadUrl}
                download
                aria-label="Download"
                title="Download"
                className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-plum hover:text-forest transition-colors"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 3v12" />
                  <path d="m7 10 5 5 5-5" />
                  <path d="M5 21h14" />
                </svg>
              </a>
            )}
            <button
              type="button"
              onClick={close}
              aria-label="Close player"
              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-plum hover:text-forest transition-colors focus:outline-none focus:ring-2 focus:ring-gold"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M5 5l14 14M19 5L5 19" />
              </svg>
            </button>
          </div>

          {/*
            Keyed on the item id so a different recording mounts a fresh transport, and NOT
            on src — a signed R2 url is re-minted on every portal fetch, and keying on it
            would remount the player, and kill the audio, the next time the host refreshed.

            durationSeconds is null because /api/portal returns no duration for recordings.
            Player treats that as the normal case and fills it from the file's own
            loadedmetadata, so the scrubber is briefly inert and then correct.
          */}
          <Player
            key={item.id}
            src={item.src}
            mediaType={item.mediaType}
            title={item.title}
            durationSeconds={null}
            onPlayingChange={(playing) =>
              post({ type: 'player-state', playing, id: item.id, title: item.title })
            }
          />
        </>
      )}
    </div>
  );
}
