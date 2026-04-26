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
  // Find every candidate start position for { or [ and try to balance to the end
  // of the corresponding bracket. Return the LONGEST valid JSON-shaped substring.
  let best = null;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== '{' && ch !== '[') continue;
    const end = findMatching(text, i);
    if (end === -1) continue;
    const candidate = text.slice(i, end + 1);
    if (!best || candidate.length > best.length) best = candidate;
  }

  return best;
}

function findMatching(text, start) {
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
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
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
