// Parsing JSON a language model wrote.
//
// Models fence their output. Even when asked for "JSON only" — and even with
// a response_format constraint on the chat API, which the Responses API calls
// here do not all use — a reply can arrive wrapped in ```json … ``` or with a
// sentence of preamble in front of the object. A bare JSON.parse throws on
// all of those, and every caller here treats a throw as "no answer": the
// product lookup falls through to "we couldn't find nutrition facts", and the
// insight quietly degrades to canned copy.
//
// Two of the parsers in this codebase already stripped fences by hand and two
// did not, which is exactly the kind of drift that makes a feature look dead
// in production while the logs look healthy. One implementation now.

/** Removes a surrounding ```json … ``` fence, if there is one. */
export function stripJsonFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

/**
 * Parses model output that is supposed to be a JSON object.
 *
 * Returns null rather than throwing — every caller's next step is a fallback,
 * not an error path. Tries the text as-is, then unfenced, then the widest
 * {...} span in it, which salvages a reply that leads with prose.
 */
export function parseModelJson<T = unknown>(raw: string | null | undefined): T | null {
  if (!raw) return null;

  const candidates: string[] = [];
  const trimmed = raw.trim();
  if (trimmed) candidates.push(trimmed);

  const unfenced = stripJsonFence(raw);
  if (unfenced && unfenced !== trimmed) candidates.push(unfenced);

  // A prose-prefixed reply: take the outermost braces.
  const source = unfenced || trimmed;
  const first = source.indexOf("{");
  const last = source.lastIndexOf("}");
  if (first !== -1 && last > first) {
    const span = source.slice(first, last + 1);
    if (!candidates.includes(span)) candidates.push(span);
  }

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      // Guard against a bare number/string/null parsing "successfully".
      if (parsed && typeof parsed === "object") return parsed as T;
    } catch {
      // try the next shape
    }
  }
  return null;
}
