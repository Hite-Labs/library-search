import Anthropic from '@anthropic-ai/sdk';
import { env } from './env';

const MODEL = 'claude-sonnet-4-5-20250929';

/**
 * Was 1024, which is close for the analyze prompt: a description plus two tag
 * lists, and the model tends to wrap the JSON in a fenced block. Running out
 * mid-JSON fails the parse rather than the request, so the extra headroom is
 * cheap insurance — output is billed per token used, not per token allowed.
 */
const MAX_TOKENS = 4096;

let _anthropic: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return _anthropic;
}

export async function chat(
  userMessage: string,
  systemPrompt: string,
): Promise<string> {
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userMessage }],
  });

  // Find the text, rather than assuming it is the first block.
  //
  // `response.content[0]` used to be read directly, which threw
  // "Cannot read properties of undefined (reading 'type')" whenever the array came
  // back empty — a real failure that surfaced to the uploader as a TypeError naming
  // no cause. Content can legitimately be empty (a refusal, or a stop before any
  // block is emitted), and when thinking is on the first block isn't the text one.
  const text = response.content.find((b) => b.type === 'text');
  if (text) return text.text;

  // No text to return. Say why, using what the response actually reports, so the
  // next failure is diagnosable from the uploader's error message alone.
  //
  // The case that prompted this: a subliminal recording, whose affirmations sit under
  // a masking layer. The transcriber can't hear them cleanly and emits a mix of English
  // and hallucinated Khmer/Georgian script, and a safety classifier declines the garbled
  // result — stop_reason "refusal", zero content blocks. Nothing to do with the content
  // itself, which is why the message below points at the transcript rather than implying
  // the recording is the problem.
  if (response.stop_reason === 'refusal') {
    throw new Error(
      'Claude declined to analyse this transcript. This usually means the transcript ' +
        'came back garbled rather than anything being wrong with the recording — ' +
        'subliminal or heavily-masked audio transcribes as nonsense. ' +
        'Fill the description and tags in by hand.',
    );
  }

  const kinds = response.content.map((b) => b.type).join(', ') || 'none';
  throw new Error(
    `Claude returned no text (stop_reason: ${response.stop_reason ?? 'unknown'}, ` +
      `content blocks: ${kinds}). ` +
      (response.stop_reason === 'max_tokens'
        ? `The reply hit the ${MAX_TOKENS}-token limit before finishing.`
        : 'Retrying usually clears this; if it repeats, the input is likely the cause.'),
  );
}
