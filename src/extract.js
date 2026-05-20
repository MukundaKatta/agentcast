/**
 * Pull JSON out of a possibly-prosed LLM response.
 *
 * Strategies, in order:
 *   1. Try the whole text as JSON.
 *   2. Look for a fenced ```json ... ``` block (also accepts plain ```...```).
 *   3. Find the largest balanced {...} or [...] substring.
 *
 * Returns the parsed value, or null if no parseable JSON was found.
 */
export function extractJson(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Strategy 1: whole text
  const whole = tryParse(trimmed);
  if (whole !== UNPARSEABLE) return whole;

  // Strategy 2: fenced code block
  const fenced = extractFenced(trimmed);
  if (fenced !== null) {
    const parsed = tryParse(fenced);
    if (parsed !== UNPARSEABLE) return parsed;
  }

  // Strategy 3: largest balanced JSON substring
  const balanced = extractLargestBalanced(trimmed);
  if (balanced !== null) {
    const parsed = tryParse(balanced);
    if (parsed !== UNPARSEABLE) return parsed;
  }

  return null;
}

const UNPARSEABLE = Symbol('UNPARSEABLE');

function tryParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return UNPARSEABLE;
  }
}

function extractFenced(text) {
  // ```json\n...\n``` or ```\n...\n```
  const re = /```(?:json|JSON|Json)?\s*\n?([\s\S]*?)\n?```/;
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

function extractLargestBalanced(text) {
  // Find the longest balanced {...} or [...] substring in a single pass.
  //
  // Previous implementation (replaced):
  //   for every '{' or '[' index, called findMatching() which scanned
  //   forward to find the matching close. That's O(N) per starting
  //   bracket × up to N starting brackets = O(N^2). On a 100k-bracket
  //   adversarial LLM response, that ran for ~14 seconds and could be
  //   used by a prompt-injected model to hang any agentcast-using test.
  //
  // Single-pass replacement:
  //   walk the text once, maintain a stack of open '{' positions and a
  //   stack of open '[' positions (separately, matching the original
  //   semantics where '{' only matches '}' and '[' only matches ']').
  //   On a close, pop the matching stack — that yields one balanced
  //   span. Track the longest seen.
  //
  // Correctness vs. the previous implementation:
  //   - For nested brackets, the OUTERMOST balanced span is the longest;
  //     this code visits all balanced spans (inner + outer) and keeps the
  //     largest, which matches the previous behavior.
  //   - For mismatched brackets within strings, the inString/escape state
  //     is identical to the previous findMatching.
  //   - For multiple top-level balanced spans, the first one wins on tie,
  //     matching the previous "> not >=" comparison.
  let best = null;
  const braceStack = [];
  const bracketStack = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      braceStack.push(i);
    } else if (ch === '[') {
      bracketStack.push(i);
    } else if (ch === '}') {
      const start = braceStack.pop();
      if (start !== undefined) {
        const len = i - start + 1;
        if (!best || len > best.length) best = text.slice(start, i + 1);
      }
    } else if (ch === ']') {
      const start = bracketStack.pop();
      if (start !== undefined) {
        const len = i - start + 1;
        if (!best || len > best.length) best = text.slice(start, i + 1);
      }
    }
  }

  return best;
}
