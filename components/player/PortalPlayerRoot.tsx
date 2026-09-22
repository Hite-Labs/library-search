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
 * rather than a styling one. That is what makes this worth a frame rather than a port of
 * Player.tsx into portal.js's ES5.
 *
 * It also means the hard part is already written. components/widget/Player.tsx is reused
 * UNMODIFIED: the three rules in its header comment are the whole design and reimplementing
 * them in a file with no build step, no tests and no way to verify in a browser (staging
 * 401s — see Q-05) would be the riskiest code in the repo written in its least verifiable
 * place, twice, once per portal twin.
 *
 * This component is deliberately thin. It owns exactly one thing: the conversation with the
 * host page.
 *
 *   in   { type: 'play-item', id, src, title, mediaType }   load this, paused
 *   in   { type: 'stop' }                                   the member asked to stop
 *   out  { type: 'resize', height }                         size my frame to fit
 *   out  { type: 'player-state', playing, id, title }       for the host's mini-bar
 *
 * Nothing here pauses or unloads on its own. portal.js closing its modal is a CSS change on
 * our container, never a teardown — which is what lets a member close the dialog, lock the
 * phone, and keep listening.
 */

interface PlayItem {
  id: string;
  src: string;
  title: string;
  mediaType: string;
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
        const { id, src, title, mediaType } = data as Partial<PlayItem>;
        // A message missing any of these would mount a Player pointed at nothing, so it is
        // dropped rather than rendered as a broken transport.
        if (!id || !src || !mediaType) return;
        setItem({ id, src, title: title ?? '', mediaType });
      } else if (data.type === 'stop') {
        // The ONE path that deliberately ends playback. Unmounting the Player detaches the
        // element, which stops it — the member asked, so this is the one time that is right.
        setItem(null);
      }
    }

    window.addEventListener('message', onMessage);
    // Tell the host we are listening. The first card click will usually beat this frame's
    // load, so portal.js queues that message and flushes it when this arrives.
    post({ type: 'player-ready' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Report our height so the host can size the frame. Same approach as WidgetRoot: measure
  // our own box rather than the document, which has a min-height that would stop the frame
  // ever shrinking back.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const notify = () => post({ type: 'resize', height: Math.ceil(el.getBoundingClientRect().height) });
    notify();
    const observer = new ResizeObserver(notify);
    observer.observe(el);
    return () => observer.disconnect();
  }, [item]);

  return (
    <div ref={rootRef} className="p-4 font-sans">
      {/*
        One slot, always rendered, exactly as DetailPanel is in the widget. The Player is
        keyed on the item id so a different recording mounts a fresh transport, and NOT on
        src — a signed R2 url is re-minted on every portal fetch, and keying on it would
        remount the player, and kill the audio, the next time the host refreshed its data.

        durationSeconds is null because /api/portal does not return a duration for
        recordings. Player treats that as the normal case and fills it in from the file's
        own loadedmetadata, so the scrubber is briefly inert and then correct.
      */}
      {item && (
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
      )}
    </div>
  );
}
