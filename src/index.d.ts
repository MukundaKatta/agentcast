/**
 * agentcast — structured output for any LLM call.
 *
 * Hand-maintained declarations. Source is JS (with JSDoc) so this file is
 * the single source of truth for TypeScript consumers. Keep in sync with
 * src/*.js.
 */

export const VERSION: string;

export interface Message {
  role: string;
  content: string;
}

export type ValidateResult<T = any> =
  | { valid: true; value?: T }
  | { valid: false; error: string };

export type Validator<T = any> = (value: any) => ValidateResult<T>;

export interface Attempt {
  text: string;
  parsed: any;
  error: string;
}

export interface CastOptions<T = any> {
  /**
   * Your LLM call. Receives the message history; must return the assistant's
   * text response. If your SDK returns a richer object, unwrap the text first.
   */
  llm: (messages: Message[]) => Promise<string>;
  /** Validator returning { valid, value? | error }. See `adapters` for builders. */
  validate: Validator<T>;
  /** User prompt. cast() appends "Respond with ONLY valid JSON" if absent. */
  prompt: string;
  /** Optional system message prepended to the message history. */
  system?: string;
  /** Total attempts = 1 + maxRetries. Default 2. */
  maxRetries?: number;
  /** Called after each FAILED attempt. Useful for logging. */
  onAttempt?: (info: { attempt: number; text: string; parsed: any; error: string }) => void;
}

/**
 * Get a typed value out of an LLM call. Validates the response, retries with
 * the validation error as feedback, throws CastError if all retries fail.
 */
export function cast<T = any>(opts: CastOptions<T>): Promise<T>;

/**
 * Pull JSON out of an LLM response. Tries: whole text, ```json``` fence,
 * largest balanced {…}/[…] substring. Returns the parsed value or null.
 */
export function extractJson(text: string): any;

export interface ZodLikeSchema {
  safeParse(value: any): { success: true; data: any } | { success: false; error: { issues?: any[]; errors?: any[] } };
}

export const adapters: {
  /**
   * Adapter for zod and zod-compatible validators (anything with safeParse()).
   */
  zod<T = any>(schema: ZodLikeSchema): Validator<T>;

  /**
   * Adapter for ad-hoc predicate validators.
   */
  fn<T = any>(
    predicate: (value: any) => boolean,
    errorBuilder?: string | ((value: any) => string)
  ): Validator<T>;

  /**
   * Tiny built-in shape checker. spec format: { field: 'string' | 'number' |
   * 'boolean' | 'array' | 'object', ... }. Suffix with '?' for optional.
   */
  shape<T = any>(spec: Record<string, string>): Validator<T>;
};

/**
 * Thrown by cast() when all retries are exhausted. Carries the full attempt
 * history so you can debug why it failed.
 */
export class CastError extends Error {
  name: 'CastError';
  attempts: Attempt[];
  lastError: string | null;
  lastText: string | null;
  lastParsed: any;
  constructor(message: string, attempts: Attempt[]);
}
