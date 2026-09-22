'use client';

import { useEffect, useRef } from 'react';
import type { Result } from './types';

/**
 * What the member asked for, and what it would cost them.
 *
 * `kind` is what the prompt is about, not merely which words to print: 'switch' names the
 * track that would open instead, 'close' has nothing to open and says so.
 */
export type PendingAction =
  | { kind: 'switch'; item: Result }
  | { kind: 'close' };

interface SwitchConfirmProps {
  /** What the member just asked for, or null when there is nothing to confirm. */
  pending: PendingAction | null;
  /** The item currently playing, named in the prompt so it is clear what would stop. */
  current: Result | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * "That would stop what you are listening to — sure?"
 *
 * Several things unmount the open Player, which destroys the <audio> element and stops
 * playback: tapping a different result card, and "Back to results". Each is right when the
 * member meant it and theft when they did not, and the layout makes the second easy. Once
 * something is playing, ResultsList filters the playing item OUT, so every card visible
 * below the player is a track-switcher and none of them is inert; and the back link sits
 * directly above the player, a thumb's width from the transport. This is the guard for
 * both — one prompt, so a new way to stop playback has somewhere to plug in rather than
 * growing its own.
 *
 * It only appears when audio is ACTUALLY playing. Acting while paused goes straight
 * through — the member has not committed to listening yet, and a prompt there is a nag.
 *
 * INLINE, deliberately not a fixed overlay. The widget lives in an iframe whose height is
 * set from its own content box (WidgetRoot's notifyHeight → embed.js), so `fixed inset-0`
 * pins to the iframe's box rather than the member's viewport: on a phone, with the frame
 * taller than the screen, a centred overlay lands off-screen. Growing the flow instead is
 * something the resize path already handles.
 *
 * KNOWN LIMITATION, accepted rather than missed: this renders above the player, while the
 * card that opened it sits below. On a long list on a small screen the prompt can be out of
 * view, and the tap then reads as having done nothing. Not fixed here because the honest
 * fix is scrolling the HOST page — the iframe is sized to its content and does not scroll
 * itself — which needs a new postMessage and a matching handler in embed.js, on a page that
 * deploys separately. Left to be judged on a real phone first; if it does feel broken, the
 * cheaper answer is marking the tapped card in place rather than building that channel.
 *
 * Not a focus trap either. The transport underneath stays live on purpose — a member who
 * opened this by accident should be able to reach pause without answering it first.
 */
export function SwitchConfirm({ pending, current, onConfirm, onCancel }: SwitchConfirmProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // onCancel is an inline arrow from the parent, so it is a new function on every parent
  // render. Naming it in an effect's deps would tear down and re-run that effect each time
  // — the churn Player.tsx:109-124 and WidgetRoot's canShowShelfRef both exist to avoid.
  // Same fix, same reason.
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  });

  // Focus the safe option when the prompt OPENS. Keyed on a stable identity for what is
  // being asked, rather than on `pending` itself, so a parent re-render while the prompt is
  // up cannot yank focus back here from wherever the member has tabbed to.
  const pendingId = pending ? (pending.kind === 'switch' ? pending.item.id : 'close') : null;
  useEffect(() => {
    if (pendingId) cancelRef.current?.focus();
  }, [pendingId]);

  // Escape cancels. Registered only while a prompt is open, so it cannot swallow the key
  // from anything else in the widget.
  useEffect(() => {
    if (!pendingId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancelRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pendingId]);

  // Rendered unconditionally by WidgetRoot and returning null here, rather than being
  // conditionally mounted there. That keeps WidgetRoot's child count identical in every
  // state, which is what keeps DetailPanel's sibling index fixed — React reconciles by
  // position, and a moving index can unmount the <audio> mid-track. Same argument
  // DetailPanel makes for itself.
  if (!pending) return null;

  return (
    <div
      role="dialog"
      // Explicitly false: this is a dialog in shape but the page behind it stays live and
      // reachable on purpose, so a member who opened it by accident can still reach pause.
      // Saying so beats letting a screen reader assume the usual modal contract.
      aria-modal="false"
      // Labelled BY the question rather than with a summary of it. An aria-label would
      // override the visible text, announcing "Switch tracks" and hiding the only part
      // that matters: which track stops and which one opens.
      aria-labelledby="switch-confirm-q"
      className="bg-transparent border tint-border-petal-40 rounded-xl p-4 space-y-3"
    >
      <p id="switch-confirm-q" className="text-sm text-petal leading-snug">
        Stop {current ? <span className="font-semibold">{current.title}</span> : 'the current track'}?
      </p>
      {/*
        The second line says what happens NEXT, which is the part that differs. Closing
        leaves nothing playing, and saying so plainly is the whole point — the member who
        brushed the back link needs to know it costs them the track, not just the screen.
      */}
      <p className="text-xs tint-petal-70 leading-relaxed">
        {pending.kind === 'switch' ? (
          <>
            <span className="font-medium">{pending.item.title}</span> will open instead, ready to
            play.
          </>
        ) : (
          'Going back closes the player, so nothing will be playing.'
        )}
      </p>
      {/*
        "Keep playing" is the filled, primary pill and comes first. The premise of this
        prompt is that the tap behind it was probably an accident, so the safe answer gets
        the emphasis and the destructive one is the quieter outline — the reverse of the
        usual confirm-dialog shape, on purpose. Both carry the same type size; letting one
        inherit the class default made them visibly mismatched rather than hierarchical.
      */}
      <div className="flex items-center gap-2 pt-1">
        <button ref={cancelRef} type="button" onClick={onCancel} className="btn-spark text-xs">
          Keep playing
        </button>
        <button type="button" onClick={onConfirm} className="btn-spark-outline-light text-xs">
          {pending.kind === 'switch' ? 'Switch' : 'Go back'}
        </button>
      </div>
    </div>
  );
}
