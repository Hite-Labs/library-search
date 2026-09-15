// Checks the sentences portal.js writes into the challenge state blocks.
//
//     node scripts/check-challenge-text.mjs
//
// Reads the functions out of public/portal.js and runs them, so this exercises the shipped
// source rather than a copy that can drift. No DOM, no browser: writeStateText only needs
// .children and .textContent, so plain objects stand in for elements.

import fs from 'node:fs';

const src = fs.readFileSync('public/portal.js', 'utf8');

// Lift a named function's source out of portal.js by brace-matching from its declaration.
// Crude, but portal.js is a plain IIFE of function declarations, and the alternative — a
// second copy of the copy here — is exactly what this script exists to avoid.
const grab = (name) => {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('not found in portal.js: ' + name);
  let depth = 0;
  for (let j = src.indexOf('{', start); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(start, j + 1);
  }
  throw new Error('unbalanced braces reading: ' + name);
};

// Built in one scope so stateText can see formatDate, then handed back. A bare eval would
// not work here: in an ES module its declarations stay inside the eval, out of reach.
const [formatDate, stateText, writeStateText] = new Function(
  grab('formatDate') + grab('stateText') + grab('writeStateText') +
  'return [formatDate, stateText, writeStateText];',
)();
void formatDate; // used by stateText, not directly here

let fail = 0;
const check = (label, got, want) => {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got ${JSON.stringify(got)}`);
};

console.log('-- not_started --');
check('has a date', stateText('not_started', { starts_at: '2026-09-03T06:00' }),
  'The next challenge begins on September 3, 2026');
check('no date -> silent', stateText('not_started', { starts_at: null }), '');

console.log('\n-- running --');
check('many days', stateText('running', { days_remaining: 16 }),
  'This challenge will be available for 16 more days');
check('exactly one (singular)', stateText('running', { days_remaining: 1 }),
  'This challenge will be available for 1 more day');
check('zero -> closes today', stateText('running', { days_remaining: 0 }),
  'This challenge closes today');
check('null -> silent', stateText('running', { days_remaining: null }), '');

console.log('\n-- finished / none stay Webflow content --');
check('finished', stateText('finished', { days_remaining: 5 }), '');
check('none', stateText('none', {}), '');

console.log('\n-- the wrapper guard --');
// A leaf heading: should be overwritten.
const leaf = { children: [], textContent: 'placeholder' };
writeStateText(leaf, 'running', { days_remaining: 16 });
check('leaf H4 gets the sentence', leaf.textContent,
  'This challenge will be available for 16 more days');

// A wrapper holding day blocks: must be left completely alone.
const wrapper = { children: [{}, {}, {}], textContent: 'DAY BLOCKS + TELEGRAM LINK' };
writeStateText(wrapper, 'running', { days_remaining: 16 });
check('wrapper untouched', wrapper.textContent, 'DAY BLOCKS + TELEGRAM LINK');

// A leaf in a state with no sentence: Webflow copy must survive.
const upsell = { children: [], textContent: "That run is over. Here's what's next." };
writeStateText(upsell, 'finished', {});
check('finished copy survives', upsell.textContent, "That run is over. Here's what's next.");

// A leaf whose sentence is empty (no date): Webflow copy must survive.
const nodate = { children: [], textContent: 'Coming soon' };
writeStateText(nodate, 'not_started', { starts_at: null });
check('no-date copy survives', nodate.textContent, 'Coming soon');

console.log(fail === 0 ? '\nAll checks passed.\n' : `\n${fail} FAILED\n`);
process.exit(fail ? 1 : 0);
