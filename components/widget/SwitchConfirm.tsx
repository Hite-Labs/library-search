'use client';

import { useEffect, useRef } from 'react';
import type { Result } from './types';

interface SwitchConfirmProps {
  /** The item the member just tapped, or null when there is nothing to confirm. */
  pending: Result | null;
  /** The item currently playing, named in the prompt so it is clear what would stop. */
  current: Result | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * "You are playing something — switch?"
 *
 * Tapping a result card unmounts the open Player, which destroys the <audio> element and
 * stops playback. That is right when the member meant it and theft when they did not, and
 * the list makes the second case easy: once something is playing, ResultsList filters the
 * playing item OUT, so every card visible below the player switches tracks. There is no
 * inert place to tap in that whole region. This is the guard.
 *
 * It only appears when audio is ACTUALLY playing. Tapping while paused switches straight
 * through — the member has not committed to listening yet, and a prompt there is a nag.
 *
 * INLINE, deliberately not a fixed overlay. The widget lives in an iframe whose height is
 * set from its own content box (WidgetRoot's notifyHeight → embed.js), so `fixed inset-0`
 * pins to the iframe's box rather than the member's viewport: on a phone, with the frame
 * taller than the screen, a centred overlay lands off-screen. Growing the flow instead is
 * something the resize path already handles.
 *
 * Not a focus trap either. The transport underneath stays live on purpose — a member who
 * opened this by accident should be able to reach pause without answering it first.
 */
export function SwitchConfirm({ pending, current, onConfirm, onCancel }: SwitchConfirmProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Escape cancels. Registered only while a prompt is open, so it cannot swallow the key
  // from anything else in the widget.
  useEffect(() => {
    if (!pending) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, onCancel]);

  // Rendered unconditionally by WidgetRoot and returning null here, rather than being
  // conditionally mounted there. That keeps WidgetRoot's child count identical in every
  // state, which is what keeps DetailPanel's sibling index fixed — React reconciles by
  // position, and a moving index can unmount the <audio> mid-track. Same argument
  // DetailPanel makes for itself.
  if (!pending) return null;

  return (
    <div
      role="dialog"
      aria-label="Switch tracks"
      className="bg-transparent border tint-border-petal-40 rounded-xl p-4 space-y-3"
    >
      <p className="text-sm text-petal leading-snug">
        Stop {current ? <span className="font-semibold">{current.title}</span> : 'the current track'}?
      </p>
      <p className="text-xs tint-petal-70 leading-relaxed">
        <span className="font-medium">{pending.title}</span> will open instead, ready to play.
      </p>
      <div className="flex items-center gap-2 pt-1">
        <button type="button" onClick={onConfirm} className="btn-spark text-xs">
          Switch
        </button>
        <button ref={cancelRef} type="button" onClick={onCancel} className="btn-spark-outline-light">
          Keep playing
        </button>
      </div>
    </div>
  );
}
