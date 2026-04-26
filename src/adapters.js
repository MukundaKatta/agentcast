/**
 * Validator adapters. Each turns a third-party validator into the shape that
 * cast() expects: (value) => { valid: true, value } | { valid: false, error: string }
 *
 * These are pure functions — they don't import zod/valibot/etc themselves, so
 * agentcast stays zero-dep. The user passes the schema in; the adapter calls
 * its safeParse-like method.
 */

/** @typedef {{ valid: true, value: any } | { valid: false, error: string }} ValidateResult */

export const adapters = {
  /**
   * Zod adapter. Works with any validator that has a `safeParse(value)` method
   * returning `{ success: true, data }` or `{ success: false, error: { issues: [...] } }`.
   * That covers zod and any zod-compatible library (e.g. valibot's safeParse).
   *
   * @param {{ safeParse: (val: any) => any }} schema
   * @returns {(val: any) => ValidateResult}
   */
  zod(schema) {
    if (!schema || typeof schema.safeParse !== 'function') {
      throw new TypeError('adapters.zod: schema must have a safeParse() method');
    }
    return (val) => {
      const r = schema.safeParse(val);
      if (r.success) return { valid: true, value: r.data };
      const issues = r.error?.issues ?? r.error?.errors ?? [{ message: String(r.error) }];
      const formatted = issues
        .map((i) => {
          const path = i.path?.length ? i.path.join('.') : '<root>';
          return `${path}: ${i.message}`;
        })
        .join('; ');
      return { valid: false, error: formatted };
    };
  },

  /**
   * Predicate adapter. For ad-hoc validation: pass a function that returns
   * true if the value is acceptable, plus an optional error builder.
   *
   * @param {(val: any) => boolean} predicate
   * @param {string | ((val: any) => string)} [errorBuilder]
   * @returns {(val: any) => ValidateResult}
   */
  fn(predicate, errorBuilder = 'value did not pass predicate') {
    if (typeof predicate !== 'function') {
      throw new TypeError('adapters.fn: predicate must be a function');
    }
    return (val) => {
      if (predicate(val)) return { valid: true, value: val };
      const err = typeof errorBuilder === 'function' ? errorBuilder(val) : errorBuilder;
      return { valid: false, error: err };
    };
  },

  /**
   * Tiny built-in shape checker for when you don't want a validator dep.
   * Spec format: { field: 'string' | 'number' | 'boolean' | 'array' | 'object', ... }
   * Required by default. Use { field: 'string?' } for optional.
   *
   * Not a full JSON Schema validator — just enough to gate basic shapes.
   *
   * @param {Record<string, string>} spec
   * @returns {(val: any) => ValidateResult}
   */
  shape(spec) {
    if (!spec || typeof spec !== 'object') {
      throw new TypeError('adapters.shape: spec must be an object');
    }
    return (val) => {
      if (val === null || typeof val !== 'object' || Array.isArray(val)) {
        return { valid: false, error: 'expected an object' };
      }
      const errors = [];
      for (const [key, type] of Object.entries(spec)) {
        const optional = type.endsWith('?');
        const baseType = optional ? type.slice(0, -1) : type;
        const present = key in val;
        if (!present) {
          if (!optional) errors.push(`missing required field '${key}'`);
          continue;
        }
        if (!matchesType(val[key], baseType)) {
          errors.push(`field '${key}' should be ${baseType}, got ${describe(val[key])}`);
        }
      }
      if (errors.length > 0) return { valid: false, error: errors.join('; ') };
      return { valid: true, value: val };
    };
  },
};

function matchesType(value, type) {
  if (type === 'string') return typeof value === 'string';
  if (type === 'number') return typeof value === 'number' && !Number.isNaN(value);
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  return false;
}

function describe(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}
