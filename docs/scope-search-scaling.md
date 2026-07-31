# SCOPED (not yet executed): Search scaling — rate limits + conditional Claude

> Status: **scoped, not started.** Written 2026-07-31. Build on a branch `search-scaling` off `main`.
> Stage 0 is a billing action Russell takes; the rest is code.

## Context

Search is the product's whole point — members asking for what they need in their own words. But
right now **every single search costs two external API calls**, and one of them is on a free tier
capped at 3 requests per minute.

`app/api/search/route.ts` today:

1. **Voyage** embeds the member's query (`route.ts:38`) — required, this is what makes semantic
   search work.
2. Neon finds the top 5 matches above a 0.4 similarity threshold (`route.ts:48-51`).
3. **Claude** writes a 2-3 sentence conversational response about those matches (`route.ts:68`).

Both calls happen on every search, successful or not. With Voyage throttled to **3 RPM / 10K TPM**
(no payment method on the account), four members searching in the same minute means someone gets an
error. That's a hard wall in front of the one feature the system exists to provide.

Discovered 2026-07-31 while testing the library browser — a burst of test edits returned
`Embedding failed: ... 429`, which initially looked like broken search.

**Two things to fix, in order:** remove the rate ceiling (billing), then stop paying for Claude on
searches that didn't need it (code + a product improvement).

---

## Stage 0 — Add a payment method to Voyage (prerequisite, not code)

**This is the actual fix for the immediate problem and should happen first.** Everything below is
optimization; this is the wall.

- Free tier: **3 RPM / 10K TPM**.
- Paid tier: **~2,000 RPM** — three orders of magnitude more headroom.
- **The 200M free voyage-3 tokens still apply after adding a card.**

Query embeddings are tiny (a search phrase is ~10 tokens), so 200M tokens is on the order of a
million searches. Realistically: add the card, stay inside the free grant for a long time, stop
being throttled. Rate limits lift a few minutes after adding the method.

**Also check the Anthropic account tier.** Claude is called on every search too, so if that account
is on a low tier it becomes the next ceiling immediately behind Voyage. Stage 1 reduces Claude
volume substantially, which helps, but the tier should be confirmed either way.

---

## Stage 1 — Only call Claude when the library comes up short

**The product decision (Russell, 2026-07-31):** when search returns good matches, the results speak
for themselves — no conversational preamble needed. Claude is only worth paying for when we have
*nothing* good to offer, and even then the value is a warm, tailored "here's what to do instead"
rather than a canned dead end.

This inverts the cost curve in the right direction: today you pay Claude most on your *successful*
searches. After this you pay only on the misses — and misses get rarer as the library grows.

**The check already exists, in the wrong place.** `SEARCH_SYSTEM_PROMPT` (`lib/prompts.ts:8-9`)
already says "if no match has a similarity score above 0.5, or the list is empty, respond with
exactly: I don't have something that's a perfect fit…". So today we pay Claude to evaluate a
threshold the code already computed. Move that decision into the route.

### Implementation

**`app/api/search/route.ts`** — after the Neon match step (~line 51), branch:

```
const STRONG_MATCH = 0.5;   // matches the threshold currently baked into the prompt
const hasStrongMatch = matches.some(m => m.similarity >= STRONG_MATCH);

if (hasStrongMatch) {
  // Skip Claude entirely. Return results with no `response`.
  return NextResponse.json({ response: null, results });
}
// else: no confident match → Claude writes a tailored fallback (see below)
```

Note the Neon query already filters at 0.4 (`matchContentItems(embedding, 0.4, 5)`), so the
0.5 gate is a second, stricter bar for "good enough to stand alone". Keep both numbers as named
constants in the route so they're tunable without hunting through a prompt string.

**`lib/prompts.ts`** — replace `SEARCH_SYSTEM_PROMPT` with a dedicated fallback prompt. It is now
only ever invoked when nothing scored well, so its whole job changes: no more "explain which
resource fits", no more embedded threshold rule. Instead:

- Acknowledge what the member actually asked for, in their words.
- Be honest that the library doesn't have a strong fit *for this specific thing* right now.
- Where the weak matches are plausibly adjacent, offer them as a "closest thing" — the route should
  pass them in, since sub-0.5 results are often still relevant.
- Point to Lindsay for a direct conversation.
- Warm, 2-3 sentences, no jargon — same voice as today.

Keep the existing `SUGGEST_` and `ANALYZE_` prompts untouched.

**`components/widget/WidgetRoot.tsx` + `components/widget/ResultsList.tsx`** — `response` becomes
nullable. `ResultsList` currently always renders the response text above the cards; it needs to
handle `response === null` by rendering results alone. Check `ResultsList.tsx`'s props and empty
states before editing — I haven't read that file yet.

**Latency win, worth noting:** the Claude call is the slowest step in the request. Skipping it on
the common path makes successful searches noticeably faster, not just cheaper.

---

## Stage 2 — Cache query embeddings

Members ask overlapping things ("anxiety", "can't sleep", "stressed about work"). Every one of
those is currently a fresh Voyage call even if fifty people asked it that day.

Normalize the query (trim, lowercase, collapse whitespace), hash it, and reuse the stored vector on
a hit. Embeddings for a given input are deterministic, so this is safe — there's no staleness
concern the way there would be with cached *results*.

**Deliberately deferred until after Stage 0 + real traffic data.** The right store (in-memory LRU
vs. a Neon table vs. Vercel Runtime Cache) depends on hit rate and deployment shape, and guessing
now means building the wrong thing. Revisit once there's a week of real search volume to look at.

---

## Stage 3 — Rate-limit `/api/search`

`/api/search` is **public and unthrottled** — it's deliberately not in `proxy.ts`'s protected list
(the search box is open to non-members by design). One script pointed at it could burn the entire
Voyage quota, and after Stage 0, run up a real bill.

`lib/rate-limit.ts` already exists and is used on the login route — reuse that pattern rather than
inventing one. Limit per member id where a verified token is present (`route.ts:27-33` already
resolves this), falling back to IP for anonymous callers.

Should ship alongside Stage 0, since adding a payment method converts "hits a wall" into "spends
money" as the failure mode.

---

## Critical files

- `app/api/search/route.ts` — the branch; both threshold constants.
- `lib/prompts.ts` — `SEARCH_SYSTEM_PROMPT` becomes a fallback-only prompt.
- `components/widget/WidgetRoot.tsx` — `response` nullable (`:27`, `:70`).
- `components/widget/ResultsList.tsx` — render results without a response. **Not yet read.**
- `lib/rate-limit.ts` — existing helper to reuse for Stage 3.

## Verification

1. `npm run build` passes.
2. **Strong match → no Claude.** Search something well-covered; confirm results render with no
   conversational text, and that no Anthropic call was made (check the response has
   `response: null`; watch pm2 logs / add a temporary log line).
3. **Latency.** Time a strong-match search before and after — it should be visibly faster.
4. **Weak match → tailored fallback.** Search something the library genuinely lacks; confirm a
   warm, specific message that references what was asked, not a canned string.
5. **Empty match.** Confirm the zero-results path still produces the fallback rather than erroring.
6. **Widget rendering.** Both paths look right in the embedded widget on Webflow — not just in the
   JSON.
7. **Rate limit** (Stage 3): hammer `/api/search` past the limit; confirm a clean 429 with a
   retry-after, and that a normal member's searching is unaffected.
8. **Regression:** `/upload` (analyze + suggest still use Claude) and the library browser's edit
   path (still uses Voyage) both still work.

## Out of scope

- Changing the 0.4 Neon threshold or the top-5 match count — tune later with real data.
- Reranking, hybrid keyword+vector search, or a different embedding model.
- Caching search *results* (as opposed to query embeddings) — different problem, real staleness
  concerns once the library changes.
