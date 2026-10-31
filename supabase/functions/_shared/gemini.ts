// Thin wrapper over the Gemini REST API — every AI call in KEZMOTO goes
// through this, so the model id and the "how do I get plain text back"
// logic live in exactly one place. GEMINI_API_KEY is read from the Edge
// Function's environment; never pass a key from the client. Plain `fetch`
// rather than an SDK — avoids any Deno/npm bundling risk for a single
// REST call.
//
// Free tier: create a key at aistudio.google.com/apikey, no billing setup
// required. It's rate-limited (requests per minute); see
// ai.google.dev/gemini-api/docs/rate-limits for current limits.
//
// Transient failures: two different things go wrong routinely and neither is
// the caller's fault. A 429 means *we* hit the per-minute quota and carries a
// RetryInfo saying how long to wait. A 503 ("this model is currently
// experiencing high demand") means *Google's* side is overloaded and carries
// no such hint. Both are retried here, with Google's own delay when it gives
// one and exponential backoff when it doesn't — and the error text for any of
// them is replaced with one plain sentence, because Google's raw prose was
// otherwise reaching end users inside a toast.
//
// thinkingConfig: live-tested this session. gemini-3.6-flash's default
// ("thinking") behavior burns the *entire* maxOutputTokens budget on internal
// reasoning before writing a single visible character, so a short
// classification/scoring prompt came back truncated mid-JSON with
// finishReason "MAX_TOKENS" and an empty answer — thinkingLevel: 'minimal'
// fixes that for THIS model. It is not a universal setting: gemini-3.8-flash
// rejects it outright with a 400 ("Thinking level MINIMAL is not supported
// for this model"), also live-tested. So thinking config is per-model below,
// and a model this project hasn't explicitly tuned gets none — a possibly
// slow/truncated answer is a recoverable failure (the MAX_TOKENS branch
// further down reports it clearly); a 400 that kills the whole request is
// not.
//
// Tried in order. Separate models have separate capacity, so when the first
// is saturated (a 503 "high demand", which retrying the same model does not
// fix) the next one usually still answers. An id that is retired or closed to
// new projects is skipped rather than failing the request (see
// isModelUnavailable), so this list degrades gracefully as Google rotates
// models — but a dead entry still earns nothing, so keep it current.
//
// gemini-3.8-flash is Google's own recommended replacement, quoted verbatim
// from the API's rejection of gemini-2.5-flash ("no longer available to new
// users. Please update your code to use models/gemini-3.8-flash").
interface ModelCandidate {
  id: string;
  /** Omit entirely for a model this hasn't been tuned against — see above. */
  thinkingLevel?: string;
}
const MODELS: ModelCandidate[] = [
  { id: 'gemini-3.6-flash', thinkingLevel: 'minimal' },
  { id: 'gemini-3.8-flash' },
];

interface GeminiCandidate {
  content?: { parts?: { text?: string }[] };
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; details?: { '@type'?: string; retryDelay?: string }[] };
}

/** Free-tier 429s carry a `RetryInfo` detail with how long Google wants us to
    wait — fall back to the caller's backoff if that's ever missing (a 503
    never carries one). Capped: a quota window can be a minute wide, and
    honoring that literally would hold a user's spinner for the whole of it.
    Better to give up inside a few seconds with a "busy, try again" message
    and let them press the retry button than to hang the request. */
function retryDelayMs(data: GeminiResponse, fallbackMs: number): number {
  const retryInfo = data.error?.details?.find((d) =>
    d['@type']?.endsWith('RetryInfo')
  );
  const seconds = retryInfo?.retryDelay ? parseFloat(retryInfo.retryDelay) : NaN;
  if (!Number.isFinite(seconds)) return fallbackMs;
  return Math.min(Math.ceil(seconds * 1000), BACKOFF_CAP_MS);
}

/**
 * "This model is retired / not available to you" — permanent for that model,
 * so retrying it is pointless and failing the whole request is wrong when
 * another candidate might work. Deliberately narrow: a 400 covers both this
 * (the model itself is the problem) and countless unrelated bad-request
 * shapes (a parameter that model rejects, a malformed prompt — the kind of
 * bug that should fail loudly, not get silently skipped). Live-tested case
 * that this must NOT match: "Thinking level MINIMAL is not supported for
 * this model" — a real, fixable request-shape bug (see MODELS'
 * thinkingLevel), not the model being unavailable, even though it contains
 * "not supported".
 *
 * Google signals genuine unavailability inconsistently: an unknown id gives
 * 404; a model that exists yet is closed to new projects gives 400 with the
 * explanation only in the message text, always phrased as the model itself
 * being retired/closed ("no longer available to new users", "is
 * deprecated") — never as some other field "not supported".
 */
function isModelUnavailable(status: number, data: GeminiResponse): boolean {
  if (status === 404) return true;
  if (status !== 400) return false;
  return /no longer available|model .* (is deprecated|does not exist)/i.test(
    data.error?.message ?? ''
  );
}

/** Exponential with jitter, capped. Jitter matters because all six AI
    features share one key: without it, two calls that collide on the same
    quota window would retry in lockstep and collide again. */
function backoffMs(attempt: number): number {
  const exponential = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_CAP_MS);
  return exponential + Math.floor(Math.random() * 250);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface AskGeminiInput {
  system: string;
  user: string;
  /** Keep this modest — none of KEZMOTO's AI features need a long answer. */
  maxTokens?: number;
  /** Attaches an image alongside `user` as an inlineData part — the only
      caller today is verify-id, reading the printed name off an ID photo.
      Every other AI feature stays text-only. */
  image?: { base64: string; mimeType: string };
  /** Attaches several images, in order, as separate inlineData parts —
      face-match's "is this ID photo and this selfie the same person"
      needs both pictures in one request. Combinable with `image` above
      (that one is sent first); most callers only ever use one or the
      other. */
  images?: { base64: string; mimeType: string }[];
}

/** All six of KEZMOTO's AI features (chatbot, ID verify, face match, fraud
    check, the two scorers) share one GEMINI_API_KEY and therefore one
    free-tier requests-per-minute quota — a burst of unrelated activity
    across the app can trip a 429 for a feature that individually did
    nothing heavy, and Google's own capacity spikes produce 503s regardless
    of what we do. Retry both, then fall through to the next model. */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
/** Per model. With two models that is up to 6 requests, but TOTAL_BUDGET_MS
    below is the real ceiling — whichever runs out first wins. */
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 800;
const BACKOFF_CAP_MS = 8000;
/** Per-attempt ceiling: a hung connection would otherwise sit there until
    the platform kills the whole function, turning a retryable blip into a
    dead request with no message. */
const ATTEMPT_TIMEOUT_MS = 20_000;
/** Hard wall-clock bound across every attempt and every model. Without this,
    attempts × models × per-attempt timeout can outlive the Edge Function
    itself, which turns a recoverable "busy" into a dead request that never
    answers — and a user is watching a spinner the whole time. */
const TOTAL_BUDGET_MS = 55_000;

/** Sends one request, returns the concatenated text parts of the reply. */
export async function askGemini(input: AskGeminiInput): Promise<string> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured for this function.');

  const parts: Record<string, unknown>[] = [{ text: input.user }];
  if (input.image) {
    parts.push({ inlineData: { mimeType: input.image.mimeType, data: input.image.base64 } });
  }
  for (const image of input.images ?? []) {
    parts.push({ inlineData: { mimeType: image.mimeType, data: image.base64 } });
  }

  const bodyFor = (model: ModelCandidate) =>
    JSON.stringify({
      system_instruction: { parts: [{ text: input.system }] },
      contents: [{ role: 'user', parts }],
      generationConfig: {
        maxOutputTokens: input.maxTokens ?? 1024,
        ...(model.thinkingLevel
          ? { thinkingConfig: { thinkingLevel: model.thinkingLevel } }
          : {}),
      },
    });
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const timeLeft = () => deadline - Date.now();

  let res: Response | null = null;
  let data: GeminiResponse = {};
  /** Set when an attempt died before producing a response at all (network
      error or the per-attempt timeout) — distinct from "Google answered, and
      the answer was an error". */
  let transportError: Error | null = null;
  /** How many candidates were rejected outright as retired/closed — if that
      is all of them, this is our configuration problem, not a busy service. */
  let unavailableModels = 0;

  // Outer: each candidate model. Inner: retries against that one model.
  // Either loop can be cut short by the shared wall-clock budget.
  models: for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${apiKey}`;
    const body = bodyFor(model);

    for (let attempt = 0; ; attempt += 1) {
      if (timeLeft() <= 0) break models;

      transportError = null;
      const abort = new AbortController();
      const timer = setTimeout(
        () => abort.abort(),
        Math.min(ATTEMPT_TIMEOUT_MS, Math.max(1, timeLeft()))
      );
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: abort.signal,
        });
        data = (await res.json()) as GeminiResponse;
      } catch (err) {
        // A timeout/abort or a dropped connection is itself retryable.
        res = null;
        transportError = err instanceof Error ? err : new Error('Gemini request failed.');
      } finally {
        clearTimeout(timer);
      }

      if (res?.ok) break models;

      // Logged, not shown: 429 (our quota) and 503 (Google's capacity) share
      // one user-facing sentence, so the function logs are the only place
      // the difference is visible when diagnosing a bad run.
      console.error(
        `[gemini] ${model.id} attempt ${attempt + 1} failed:`,
        res ? `HTTP ${res.status} ${data.error?.message ?? ''}`.trim() : `transport ${transportError?.name}`
      );

      // A retired/closed model is permanent — don't burn retries on it, just
      // move to the next candidate.
      if (res && isModelUnavailable(res.status, data)) {
        unavailableModels += 1;
        continue models;
      }

      const retryable = res === null || RETRYABLE_STATUSES.has(res.status);
      if (!retryable) break models; // a real caller error (400/403) — report it

      if (attempt >= MAX_RETRIES) continue models; // this model is saturated

      // Google's RetryInfo when it gave one (429s do), our own backoff when
      // it didn't (503s never do, and a timeout has no body at all).
      const wait = res === null ? backoffMs(attempt) : retryDelayMs(data, backoffMs(attempt));
      if (wait >= timeLeft()) break models;
      await sleep(wait);
    }
  }

  // Every candidate was retired/closed. That is a MODELS list that needs
  // updating, not anything the user did or can retry — the real reason is in
  // the console.error above, so don't put Google's prose in a toast.
  if (unavailableModels === MODELS.length) {
    throw new Error(
      'The AI assistant is unavailable right now. If this keeps happening, it needs attention from the KEZMOTO team.'
    );
  }

  // Every attempt failed before Google answered — report it as busy rather
  // than leaking an AbortError, which is what a timeout surfaces as.
  if (res === null) {
    throw new Error(
      transportError?.name === 'AbortError'
        ? 'The AI assistant took too long to respond — please try again in a moment.'
        : 'Could not reach the AI assistant right now — please try again in a moment.'
    );
  }

  if (!res.ok) {
    // Google's own prose used to reach end users verbatim inside a toast —
    // both the 429/503 "experiencing high demand" text and the 400 "no longer
    // available to new users, please update your code" text, neither of which
    // means anything to someone uploading an ID. Anything retryable, and any
    // model-availability rejection, gets one plain sentence instead.
    //
    // Note this branch can be reached holding the *last* model's response
    // while an *earlier* one was merely busy — "busy, try again" is the
    // honest advice in that case, since a retry really might succeed.
    // Genuine caller mistakes (a malformed request, a bad key) still surface
    // their real message, which is what keeps them debuggable.
    const softFailure =
      RETRYABLE_STATUSES.has(res.status) || isModelUnavailable(res.status, data);
    const message = softFailure
      ? 'The AI assistant is busy right now — please try again in a moment.'
      : (data.error?.message ?? `Gemini request failed (${res.status}).`);
    throw new Error(message);
  }

  if (!data.candidates || data.candidates.length === 0) {
    throw new Error('The AI declined to answer that request.');
  }

  const text = (data.candidates[0].content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('\n')
    .trim();

  // Defense in depth: a truncated reply (hit maxOutputTokens before writing
  // anything visible) should fail loudly, not silently hand back "" for a
  // caller's extractJson() to quietly treat as a parse failure.
  if (!text && data.candidates[0].finishReason === 'MAX_TOKENS') {
    throw new Error('Gemini reply was truncated before producing an answer — try a larger maxTokens.');
  }

  return text;
}

/**
 * Pulls the first `{...}` JSON object out of a text reply and parses it.
 * Gemini is asked to answer with only JSON, but this tolerates a stray
 * sentence around it rather than depending on structured-outputs syntax
 * this project hasn't otherwise needed.
 */
export function extractJson<T>(text: string): T | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}
