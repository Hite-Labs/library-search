/**
 * Session-log action items (client actions, coach actions), stored one per line.
 *
 * Lindsay pastes these as a bulleted list — from Google Docs, Notes, an email — so the
 * text arrives with whatever markers that source used: "•", "-", "1.", "a)", tabs for
 * nesting. Each non-empty line is one item; the markers are stripped so the portal can
 * present items as separate rows rather than echoing someone else's bullets.
 *
 * Pure and dependency-free: used on save (lib/db.ts), by the portal API, and by the
 * dashboard view.
 */

// Symbol bullets may hug the text ("•Item"); ASCII ones and numbering need a space after,
// so "-5 min walk" or "3.5 hours" isn't mistaken for a list marker.
const SYMBOL_BULLET = /^[•◦·▪▫●○■□➢➤►▸✓✔–—]\s*/;
const ASCII_OR_NUMBERED = /^(?:[-*+]|\d{1,3}[.)]|[a-zA-Z][.)]|\(?[ivx]{1,4}\))\s+/;

export function splitActionItems(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((line) => {
      let s = line.trim();
      // Twice, for pasted nesting like "1. • item".
      for (let i = 0; i < 2; i++) {
        s = s.replace(SYMBOL_BULLET, '').replace(ASCII_OR_NUMBERED, '').trim();
      }
      return s;
    })
    .filter(Boolean);
}

/** What gets stored: the items, one per line, markers removed. */
export function normaliseActionItems(text: string | null | undefined): string {
  return splitActionItems(text).join('\n');
}
