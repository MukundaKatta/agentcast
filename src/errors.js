/**
 * CastError — thrown when cast() exhausts its retries without producing a
 * value that passes validation.
 *
 * Carries the full attempt history so the caller can debug why it failed:
 *   - attempts:   array of { text, parsed, error } per attempt
 *   - lastError:  the validation error message from the final attempt
 *   - lastText:   the raw text the model returned on the final attempt
 *   - lastParsed: the value that was extracted (or null if extraction failed)
 */
export class CastError extends Error {
  /**
   * @param {string} message
   * @param {Attempt[]} attempts
   */
  constructor(message, attempts) {
    super(message);
    this.name = 'CastError';
    this.attempts = attempts;
    const last = attempts[attempts.length - 1];
    this.lastError = last?.error ?? null;
    this.lastText = last?.text ?? null;
    this.lastParsed = last?.parsed ?? null;
  }
}

/**
 * @typedef {Object} Attempt
 * @property {string} text       Raw text returned by the LLM
 * @property {any} parsed        Value extracted via extractJson() (or null if extraction failed)
 * @property {string} error      Validation error message (or 'No JSON found...' if extraction failed)
 */
